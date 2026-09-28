from data import questions, misconceptions


def normalize_answer(answer):
    return str(answer).strip().replace(" ", "").replace(",", ".")


def find_question(question_id):
    for question in questions:
        if question["id"] == question_id:
            return question

    return None


def answers_equal(correct_answer, user_answer):
    correct = normalize_answer(correct_answer)
    user = normalize_answer(user_answer)

    # Для відповідей з кількома коренями: -3;3 або 3;-3
    if ";" in correct:
        correct_parts = sorted(correct.split(";"))
        user_parts = sorted(user.split(";"))

        return correct_parts == user_parts

    return correct == user


def check_answer(question_id, user_answer):
    question = find_question(question_id)

    if question is None:
        return {
            "correct": False,
            "error": "Питання не знайдено"
        }

    if answers_equal(question["correct_answer"], user_answer):
        return {
            "correct": True,
            "topic": question["topic"],
            "skill": question["skill"],
            "misconception": None
        }

    misconception_id = None

    for mistake_answer, mistake_id in question["common_mistakes"].items():
        if answers_equal(mistake_answer, user_answer):
            misconception_id = mistake_id
            break

    return {
        "correct": False,
        "topic": question["topic"],
        "skill": question["skill"],
        "misconception": misconception_id
    }


def analyze_results(user_answers):
    topic_results = {}
    found_misconceptions = []

    for user_answer in user_answers:
        question_id = user_answer["question_id"]
        answer = user_answer["answer"]

        result = check_answer(question_id, answer)

        if "topic" not in result:
            continue

        topic = result["topic"]

        if topic not in topic_results:
            topic_results[topic] = {
                "correct": 0,
                "total": 0
            }

        topic_results[topic]["total"] += 1

        if result["correct"]:
            topic_results[topic]["correct"] += 1

        if result["misconception"] is not None:
            found_misconceptions.append(result["misconception"])

    weak_topics = []

    for topic, result in topic_results.items():
        percent = round(
            result["correct"] / result["total"] * 100
        )

        result["percent"] = percent

        if percent < 70:
            weak_topics.append(topic)

    return {
        "topics": topic_results,
        "weak_topics": weak_topics,
        "misconceptions": found_misconceptions
    }


def get_misconception_info(misconception_id):
    if misconception_id in misconceptions:
        return misconceptions[misconception_id]

    return None


def get_next_question(topic, current_difficulty, was_correct):
    if was_correct:
        new_difficulty = min(current_difficulty + 1, 3)
    else:
        new_difficulty = max(current_difficulty - 1, 1)

    for question in questions:
        if (
            question["topic"] == topic
            and question["difficulty"] == new_difficulty
        ):
            return question

    return None
