skills = {
    "fractions_basic": {
        "name": "Основні дії з дробами",
        "topic": "fractions",
        "prerequisites": []
    },

    "percent_basic": {
        "name": "Основні дії з відсотками",
        "topic": "percentages",
        "prerequisites": []
    },

    "powers_basic": {
        "name": "Основні властивості степенів",
        "topic": "powers",
        "prerequisites": []
    },

    "multiplication_same_base": {
        "name": "Множення степенів з однаковою основою",
        "topic": "powers",
        "prerequisites": [
            "powers_basic"
        ]
    },

    "negative_numbers": {
        "name": "Дії з від'ємними числами",
        "topic": "linear_equations",
        "prerequisites": []
    },

    "linear_equation_basic": {
        "name": "Лінійні рівняння",
        "topic": "linear_equations",
        "prerequisites": [
            "negative_numbers"
        ]
    },

    "quadratic_equation_basic": {
        "name": "Квадратні рівняння",
        "topic": "quadratic_equations",
        "prerequisites": [
            "powers_basic",
            "negative_numbers",
            "linear_equation_basic"
        ]
    }
}
