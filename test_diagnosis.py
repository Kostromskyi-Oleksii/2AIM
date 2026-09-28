from backend.diagnosis import check_answer, analyze_results


print("Перевірка окремої відповіді:")
print(check_answer(11, "64"))

print()

test_answers = [
    {"question_id": 1, "answer": "3/4"},
    {"question_id": 6, "answer": "30"},
    {"question_id": 11, "answer": "64"},
    {"question_id": 16, "answer": "4"},
    {"question_id": 21, "answer": "3;-3"}
]

print("Результат діагностики:")
print(analyze_results(test_answers))
