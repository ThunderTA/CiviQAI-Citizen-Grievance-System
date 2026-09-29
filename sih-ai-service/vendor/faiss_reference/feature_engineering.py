import pandas as pd
from sklearn.preprocessing import LabelEncoder
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.model_selection import train_test_split
import pickle, joblib
import os

input_path="data/processed/complaints_cleaned.csv"
processed_dir="data/processed"
models_dir="models"

# Ensure directories exist
os.makedirs(processed_dir, exist_ok=True)
os.makedirs(models_dir, exist_ok=True)

df=pd.read_csv(input_path)
print("row:",len(df))
print("columns",list(df.columns))

le_cat=LabelEncoder()
df["category_encoded"]=le_cat.fit_transform(df["category"])

with open(os.path.join(models_dir, "label_encoder.pkl"), "wb") as f:
    pickle.dump(le_cat, f)

vectorizer = TfidfVectorizer(max_features=1000, stop_words='english')
X = vectorizer.fit_transform(df["cleaned_text"])
y = df["category_encoded"]

with open(os.path.join(models_dir, "vectorizer.pkl"), "wb") as f:
    pickle.dump(vectorizer, f)

print("\n📊 Splitting data into train/test sets...")

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# Save split data
joblib.dump((X_train, X_test, y_train, y_test), os.path.join(processed_dir, "split_data.pkl"))

# ----------------------------
# 4️⃣ Save encoded dataset
# ----------------------------
encoded_path = os.path.join(processed_dir, "complaints_encoded.csv")
df.to_csv(encoded_path, index=False)

print(f"\n✅ Feature engineering completed!")
print(f"📁 Encoded dataset saved to: {encoded_path}")
print(f"💾 TF-IDF + LabelEncoder models saved in: {models_dir}/")
print(f"📊 Split data saved to: {processed_dir}/split_data.pkl")
