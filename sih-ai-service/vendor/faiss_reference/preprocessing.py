import pandas as pd
import numpy as np
import re
import nltk
from nltk.corpus import stopwords
from nltk.stem import WordNetLemmatizer

nltk.download('stopwords')
nltk.download('wordnet')

use_cols = [
    'complaint_id', 'cleaned_text', 'category',
    'subcategory', 'priority', 'city', 'state', 'tags'
]
df=pd.read_csv("data/raw/complaints.csv",usecols=use_cols)
print("rows",len(df))
print("columns",df.columns.tolist())

df = df.dropna(subset=['cleaned_text', 'category', 'priority'])
df = df.drop_duplicates(subset=['cleaned_text'])


#cleaning
texts=df['cleaned_text'].astype(str)
def clean_text(text):
    text=text.lower()
    text=re.sub(r'[^a-zA-Z0-9\s]', '', text) #punctuation
    text=re.sub(r'\s+',' ',text).strip() #extra_spaces
    return text

texts=texts.apply(clean_text)


#stopwords
stop_words = set(stopwords.words('english'))
def remove_stopwords(text):
    return ' '.join([word for word in text.split() if word not in stop_words])

texts = texts.apply(remove_stopwords)

#lemmatizer [running->run(root form)]
lemmatizer = WordNetLemmatizer()

def lemmatize_text(text):
    return ' '.join([lemmatizer.lemmatize(word) for word in text.split()])

texts = texts.apply(lemmatize_text)

# Replace original column or create new column
df['cleaned_text'] = texts

#label encoding
from sklearn.preprocessing import LabelEncoder

label_cols = ['category', 'subcategory', 'priority']

for col in label_cols:
    le = LabelEncoder()
    df[col] = le.fit_transform(df[col])


df_final = df[['complaint_id', 'cleaned_text', 'category', 'subcategory', 'priority', 'city', 'state', 'tags']]

df_final.to_csv("data/processed/complaints_cleaned.csv", index=False)
print("✅ Preprocessing done. Saved to data/complaints_cleaned.csv")