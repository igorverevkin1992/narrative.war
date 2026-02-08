import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
# Импортируем функцию поиска, которую мы создали на прошлом шаге
from scripts.style_search import get_style_examples 

app = FastAPI()

# --- Настройка CORS ---
# Это разрешает вашему React-приложению (на порту 5173) стучаться к этому серверу (на порт 8000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Модель данных (что мы ждем от фронтенда)
class TopicRequest(BaseModel):
    topic: str

@app.get("/")
def read_root():
    return {"status": "MediaWar Backend is running"}

@app.post("/api/get-harris-style")
async def get_style(request: TopicRequest):
    """
    Принимает тему, ищет в базе ChromaDB подходящие цитаты Джонни Харриса
    и возвращает их фронтенду.
    """
    print(f"📥 Запрос стиля для темы: {request.topic}")
    try:
        # 1. Ищем в базе (функция из scripts/style_search.py)
        style_context = get_style_examples(request.topic)
        
        # 2. Возвращаем результат
        return {
            "topic": request.topic,
            "style_context": style_context
        }
    except Exception as e:
        print(f"❌ Ошибка сервера: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    # Запуск сервера на порту 8000
    uvicorn.run(app, host="0.0.0.0", port=8000)