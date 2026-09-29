import streamlit as st
import pandas as pd
import matplotlib.pyplot as plt
from wordcloud import WordCloud
import os

st.set_page_config(page_title="Government Complaint Dashboard", layout="wide")

DATA_PATH = "data/processed/data_summary.csv"

# ============= Load Data =============
if not os.path.exists(DATA_PATH):
    st.error("❌ Data summary not found! Run summarizer.py first.")
    st.stop()

df = pd.read_csv(DATA_PATH)

st.title("📊 Government Complaint Summary Dashboard")

if df.empty:
    st.warning("No data found in data_summary.csv")
    st.stop()

# ============= Overview Metrics =============
st.subheader("🧾 Overall Summary")
st.write(f"Total Complaints: **{len(df)}**")

# If columns exist
if "category" in df.columns:
    st.write(f"Unique Categories: **{df['category'].nunique()}**")

if "area" in df.columns:
    st.write(f"Areas Reported: **{df['area'].nunique()}**")

# ============= Top Complaint Categories =============
if "category" in df.columns:
    st.subheader("🏷️ Top Complaint Categories")
    cat_counts = df["category"].value_counts().head(10)
    st.bar_chart(cat_counts)

# ============= Complaints by Area =============
if "area" in df.columns:
    st.subheader("📍 Complaints by Area")
    area_counts = df["area"].value_counts().head(10)
    st.bar_chart(area_counts)

# ============= Word Cloud of Complaint Text =============
if "summary" in df.columns:
    st.subheader("☁️ Common Words in Summaries")
    text = " ".join(df["summary"].astype(str))
    if text.strip():
        wc = WordCloud(width=800, height=400, background_color="white").generate(text)
        st.image(wc.to_array(), use_column_width=True)

# ============= Raw Data =============
with st.expander("📂 View Raw Data"):
    st.dataframe(df.head(50))

st.success("✅ Dashboard loaded successfully.")
