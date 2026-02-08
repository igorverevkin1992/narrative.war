import os
import google.generativeai as genai
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_chroma import Chroma
from dotenv import load_dotenv

load_dotenv()

CHROMA_PATH = "chroma_db"
API_KEY = os.getenv("GOOGLE_API_KEY")

# Настраиваем Gemini
genai.configure(api_key=API_KEY)

def get_style_examples(query_topic, k=3):
    """
    Ищет в базе ChromaDB 3 самых похожих отрывка из транскриптов
    на заданную тему (query_topic).
    """
    # 1. Определяем ту же модель эмбеддингов, что и при создании базы
    # Нам нужно найти рабочую, как в ingest_style.py
    embedding_model = "models/text-embedding-004" # По умолчанию
    
    # Быстрая проверка моделей (копия логики из ingest)
    for model in genai.list_models():
        if 'embedContent' in model.supported_generation_methods:
            embedding_model = model.name
            break
            
    embeddings = GoogleGenerativeAIEmbeddings(model=embedding_model)

    # 2. Подключаемся к существующей базе
    try:
        db = Chroma(persist_directory=CHROMA_PATH, embedding_function=embeddings)
        
        # 3. Поиск (Retrieval)
        results = db.similarity_search(query_topic, k=k)
        
        # 4. Собираем текст
        context_text = "\n\n".join([f"--- ПРИМЕР СТИЛЯ {i+1} ---\n{doc.page_content}" for i, doc in enumerate(results)])
        return context_text
        
    except Exception as e:
        print(f"Ошибка поиска в базе: {e}")
        return ""

# Тест (если запустить файл напрямую)
if __name__ == "__main__":
    test_topic = "War in Ukraine"
    print(f"🔍 Тестовый поиск для темы: {test_topic}")
    print(get_style_examples(test_topic))