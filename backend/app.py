from fastapi import FastAPI
from pydantic import BaseModel
from groq import Groq
import os
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware 

load_dotenv()
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
class QuestionRequest(BaseModel):
    question: str
    student_answer: str

@app.get("/")
def read_root():
    return {"message": "Сервер працює! Перейди на /docs для тестування."}

@app.post("/ask_ai")
def ask_ai(data: QuestionRequest):
    system_prompt = """
    Ти — досвідчений репетитор з математики. 
    Твоя мета — допомогти учневі знайти помилку самостійно. 
    НІКОЛИ не давай готову правильну відповідь. Став лише одне навідне запитання.
    """
    
    user_prompt = f"Завдання: {data.question}. Учень відповів: {data.student_answer}. Допоможи йому."

    try:
        response = client.chat.completions.create(
        model="openai/gpt-oss-120b",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.7
        )
        return {"ai_hint": response.choices[0].message.content}
    
    except Exception as e:
        return {"error": str(e)}