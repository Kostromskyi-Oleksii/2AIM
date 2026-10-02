from fastapi import FastAPI
from pydantic import BaseModel
from groq import Groq
import os
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware 
from typing import List

from backend.diagnosis import check_answer, analyze_results, get_next_question

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

class ChatRequest(BaseModel):
    question: str
    student_answer: str

class AnswerSubmission(BaseModel):
    question_id: int
    user_answer: str

class DiagnosticState(BaseModel):
    topic: str
    current_difficulty: int
    was_correct: bool

class AnalyzeRequest(BaseModel):
    user_answers: List[dict] 

class PlanRequest(BaseModel):
    weak_topics: List[str]
    misconceptions: List[str]

@app.get("/")
def read_root():
    return {"message": "Сервер працює! Перейди на /docs для тестування."}

@app.post("/check_answer")
def api_check_answer(data: AnswerSubmission):
    result = check_answer(data.question_id, data.user_answer)
    return result

@app.post("/next_question")
def api_next_question(data: DiagnosticState):
    question = get_next_question(data.topic, data.current_difficulty, data.was_correct)
    if question:
        return question
    return {"message": "Завдання закінчилися"}

@app.post("/analyze")
def api_analyze(data: AnalyzeRequest):
    results = analyze_results(data.user_answers)
    return results

@app.post("/ask_ai")
def ask_ai(data: ChatRequest):
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

@app.post("/generate_plan")
def generate_plan(data: PlanRequest):
    system_prompt = """
    Ти — ШІ-наставник для підготовки до НМТ з математики.
    Тобі передадуть список слабких тем учня та його типові помилки (misconceptions).
    Склади короткий, чіткий і персоналізований план повторення на 2-3 дні. 
    Пиши українською мовою, звертайся на "ти", без зайвої води.
    """

    user_prompt = f"Слабкі теми: {', '.join(data.weak_topics)}. Типові помилки: {', '.join(data.misconceptions)}."

    try:
        response = client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.7
        )
        return {"personal_plan": response.choices[0].message.content}
    except Exception as e:
        return {"error": str(e)}