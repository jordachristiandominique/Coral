# Coral App - Django Project

## Setup Instructions

### Prerequisites
- Python 3.14+ installed

### Initial Setup

1. **Activate Virtual Environment**
   ```bash
   # On Windows
   .\venv\Scripts\activate
   
   # On macOS/Linux
   source venv/bin/activate
   ```

2. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Create .env File**
   ```bash
   # Copy the example .env file and customize as needed
   copy .env.example .env
   ```

4. **Apply Migrations**
   ```bash
   python manage.py migrate
   ```

5. **Create Superuser (Admin Account)**
   ```bash
   python manage.py createsuperuser
   ```

### Running the Development Server

```bash
python manage.py runserver
```

The development server will start at `http://localhost:8000/`
Admin panel: `http://localhost:8000/admin/`

## Project Structure

```
coral_app/
├── coral_app/          # Project configuration
│   ├── settings.py     # Settings
│   ├── urls.py         # URL routing
│   ├── wsgi.py         # WSGI config
│   └── asgi.py         # ASGI config
├── manage.py           # Django management script
├── requirements.txt    # Python dependencies
├── venv/               # Virtual environment
├── .env.example        # Environment variables template
└── .gitignore          # Git ignore rules
```

## Creating Apps

To create a new Django app:

```bash
python manage.py startapp app_name
```

Then add the app to `INSTALLED_APPS` in `settings.py`.

## Useful Commands

- `python manage.py makemigrations` - Create migrations
- `python manage.py migrate` - Apply migrations
- `python manage.py createsuperuser` - Create admin user
- `python manage.py collectstatic` - Collect static files
- `python manage.py shell` - Django interactive shell
- `python manage.py test` - Run tests

## Next Steps

1. Configure your database in `settings.py` (currently using SQLite)
2. Create your first Django app
3. Define your models and views
4. Set up your URL routing

Happy coding! 🚀
