# Project brainstorming

```
Design a RESTful API for a simple task management system using Django + React.The API should allow users to:
- Create, read, update, and delete users.
- Create, read, update, and delete tasks.
- Assign tasks to users. Mark tasks as completed.
- Filter tasks based on status and due date.
- Background processing of tasks notifications trough email, sent on task update or scheduled for overdue tasks
- Users roles include Admin, Supervisor and Operator
-- Admin: users management
-- Supervisor: tasks management for any user
-- Operator:  tasks management for owned tasks, created or assigned by supervisor)

Minimal requirements:
Backend
- Python 3.12+ and Django 6+
- django-simple-history for audit logs
- uv as package manager
API Development:
- Use Django (Django REST Framework)
- JWT authentication
- Implement pagination in lists
- Support filtering tasks by status and due date.
- Implement rate limiting to prevent API abuse
- Background tasks processing using celery with redis as broker
- Authentication, authorization and validations for each operation, isolated from frontend validations
- Optimized queries using databse indexing and Django queries optimization (select_related or prefetch_related if required)
Database:
- Postgresql for data storage
- Database schema design for tasks and users, mermaid diagrams for docs
Unit test:
- Write unit tests for critical endpoints using pytest
-  Ensure at least 80% test coverage.
Dockerization:
- Provide Dockerfile and docker-compose.yml to setup local app and database.
Documentation:
- README.md in project root with setup instructions and relevant key implementation decisions (django apps structure, architecture, conventions, etc)
- drf-yasg for API documentation
Frontend
- React with responsive and user-friendly design
- Tanstack for routing and query server state
- Users and tasks CRUD based on backend api
- Login page
- Statistics dashboard related to tasks status

CI/CD
- Github actions workflow for lint (ruff), pytest and coverage on push, equivalent to pre-commit definition
Diagrams
- Documented architecture, database schema and workflows using mermaid

With the specification above start a brainstorming to define spec documents for project using /superpowers-extended-cc:brainstorming  
```

Related skill: https://github.com/pcvelz/superpowers


# Specs review
```
After reviewing specs I need to address the following concerns:

- In accepted risks, "An Operator can delete assigned work" restrict operator delete to created task to avoid deletion of tasks created by a different user and assigned by supevisor
- In 3.2 Architecture, D8 and D9 should be reverted, the application should keep repositores architecture to maintain consistency with proposed backend architecture and consistency with services implementation. 3.3 D14 mentions created_by as audit but its also used for validate deletion of owned tasks. 
- Implement uuidv7 for unique ids to improve securiy while keeping index performance

```

# Task planning

```
Continue with tasks planning considering DoD and conventions provided in backend/AGENTS.md and frontend/AGENTS.md using /superpowers-extended-cc:writing-plans

```


# Executing plan

```
/superpowers-extended-cc:executing-plans docs/superpowers/plans/2026-10-06-task-management-system.md

```