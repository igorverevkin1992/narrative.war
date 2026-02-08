import os
import sys
from dotenv import load_dotenv
from langchain_community.document_loaders import Docx2txtLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_chroma import Chroma
import google.generativeai as genai

# 1. Настройка
load_dotenv()
api_key = os.getenv("GOOGLE_API_KEY")

SOURCE_FILE = "training_data/all_transcripts.docx" 
CHROMA_PATH = "chroma_db"

if not api_key:
    raise ValueError("❌ Ошибка: Не найден GOOGLE_API_KEY в файле .env")

def get_available_embedding_model():
    """Функция автоматически ищет доступную модель эмбеддинга"""
    print("🔍 Ищем доступные модели эмбеддинга в вашем аккаунте Google...")
    try:
        genai.configure(api_key=api_key)
        for model in genai.list_models():
            if 'embedContent' in model.supported_generation_methods:
                print(f"   ✅ Найдена модель: {model.name}")
                return model.name
    except Exception as e:
        print(f"⚠️ Ошибка при поиске моделей: {e}")
        # Если не удалось найти автоматически, пробуем самую популярную наугад
        return "models/embedding-001"
    
    return None

def ingest_one_big_file():
    # 2. Выбор модели
    model_name = get_available_embedding_model()
    if not model_name:
        print("❌ Не найдено ни одной модели для эмбеддинга! Проверьте API ключ.")
        return

    print(f"🚀 Начинаем обработку файла: {SOURCE_FILE} с моделью {model_name}")

    if not os.path.exists(SOURCE_FILE):
        print(f"❌ Файл не найден! Положите транскрипты в {SOURCE_FILE}")
        return

    # 3. Загрузка
    try:
        loader = Docx2txtLoader(SOURCE_FILE)
        document = loader.load()
        if not document:
             print("❌ Файл пуст.")
             return
        print(f"📄 Файл загружен. Длина: {len(document[0].page_content)} символов")
    except Exception as e:
        print(f"❌ Ошибка чтения файла: {e}")
        return

    # 4. Нарезка
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=2000,
        chunk_overlap=500,
        separators=["\n\n", "\n", ". ", " ", ""]
    )
    chunks = text_splitter.split_documents(document)
    print(f"✂️ Файл нарезан на {len(chunks)} фрагментов.")

    # 5. Векторизация и сохранение
    print("🧠 Создаем базу знаний...")
    try:
        embeddings = GoogleGenerativeAIEmbeddings(model=model_name)
        Chroma.from_documents(
            documents=chunks, 
            embedding=embeddings,
            persist_directory=CHROMA_PATH
        )
        print(f"🎉 УСПЕХ! Стиль Джонни Харриса сохранен в папку '{CHROMA_PATH}'")
    except Exception as e:
        print(f"❌ Ошибка при создании базы: {e}")

if __name__ == "__main__":
    ingest_one_big_file()