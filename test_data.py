from data import topics, questions, skills, misconceptions

print("Кількість тем:", len(topics))
print("Кількість завдань:", len(questions))
print("Кількість навичок:", len(skills))
print("Кількість типових помилок:", len(misconceptions))

print()

for question in questions:
    print(
        question["id"],
        question["question"],
        "|",
        question["topic"],
        "| рівень:",
        question["difficulty"]
    )
