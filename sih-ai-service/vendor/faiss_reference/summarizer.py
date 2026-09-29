import pandas as pd
import re
from tqdm import tqdm

print("📂 Loading complaints data...")
df = pd.read_csv("data/processed/complaints_cleaned.csv")

# ✅ Clean duplicates and missing values
df = df.drop_duplicates(subset=["cleaned_text"]).dropna(subset=["cleaned_text"])
df = df[df["cleaned_text"].str.strip() != ""]

def smart_summary(text: str) -> str:
    """
    Simple rule-based summary generator for complaint text.
    Modify logic as needed, but function name must remain 'smart_summary'.
    """
    if not text or not isinstance(text, str):
        return ""
    text = text.strip()
    if len(text.split()) <= 10:
        return text
    # Basic rule-based summarization logic
    sentences = text.split(".")
    first = sentences[0].strip()
    if "water" in text.lower():
        return f"Summary: Water issue - {first}"
    elif "power" in text.lower() or "electric" in text.lower():
        return f"Summary: Power issue - {first}"
    elif "road" in text.lower():
        return f"Summary: Road condition - {first}"
    elif "garbage" in text.lower() or "sewage" in text.lower():
        return f"Summary: Sanitation problem - {first}"
    else:
        return f"Summary: General complaint - {first}"



print("🧠 Generating summaries...")
df["summary"] = [smart_summary(t) for t in tqdm(df["cleaned_text"].tolist())]

# ✅ Save final summarized data
output_path = "data/processed/data_summary.csv"
df.to_csv(output_path, index=False)

print(f"\n✅ Summaries saved successfully to: {output_path}")

