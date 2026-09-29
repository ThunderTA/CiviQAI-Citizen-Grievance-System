import os
import pickle
import pandas as pd
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.decomposition import TruncatedSVD
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.metrics import classification_report, accuracy_score
from sklearn.utils import shuffle

# ----------------------------
# Step 1: Load cleaned dataset
# ----------------------------
data_path = "data/processed/complaints_cleaned.csv"

if not os.path.exists(data_path):
    raise FileNotFoundError(f"❌ File not found: {data_path}")

df = pd.read_csv(data_path)
df = shuffle(df, random_state=42).reset_index(drop=True)

X = df["cleaned_text"]
y = df["category"]

print(f"✅ Loaded dataset with {len(df)} complaints.")

# ----------------------------
# Step 2: Train-test split
# ----------------------------
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# ----------------------------
# Step 3: Build pipeline
# ----------------------------
pipeline = Pipeline([
    ("tfidf", TfidfVectorizer(
        max_features=4000,
        ngram_range=(1, 3),
        stop_words="english",
        min_df=3,
        max_df=0.9
    )),
    ("svd", TruncatedSVD(n_components=300, random_state=42)),
    ("clf", LogisticRegression(
        C=0.8,
        solver='liblinear',
        max_iter=1000,
        class_weight='balanced',
        random_state=42
    ))
])

# ----------------------------
# Step 4: Train model
# ----------------------------
print("🚀 Training model...")
pipeline.fit(X_train, y_train)

# ----------------------------
# Step 5: Cross-validation
# ----------------------------
cv_scores = cross_val_score(pipeline, X_train, y_train, cv=5, scoring='accuracy')
print(f"📊 CV Accuracy: {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")

# ----------------------------
# Step 6: Evaluate on test set
# ----------------------------
y_pred = pipeline.predict(X_test)
test_acc = accuracy_score(y_test, y_pred)

print(f"✅ Test Accuracy: {test_acc:.4f}")
print("\n📋 Classification Report:\n", classification_report(y_test, y_pred))

# ----------------------------
# Step 7: Save model pipeline
# ----------------------------
os.makedirs("models", exist_ok=True)
model_path = "models/category_pipeline.pkl"

with open(model_path, "wb") as f:
    pickle.dump(pipeline, f)

print(f"💾 Model pipeline saved successfully at: {model_path}")

# ----------------------------
# Step 8: Verify save
# ----------------------------
with open(model_path, "rb") as f:
    loaded_pipeline = pickle.load(f)

sample_text = ["dirty water complaint"]
pred = loaded_pipeline.predict(sample_text)[0]
print(f"🔍 Sample prediction check: '{sample_text[0]}' → Category {pred}")

print("🏁 Training and saving completed successfully!")
