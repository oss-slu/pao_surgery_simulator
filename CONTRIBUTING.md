# Contributing to PAO Surgery Simulator

Thank you for your interest in contributing to the PAO Surgery Simulator project. We welcome contributions from the community, including bug reports, documentation improvements, feature ideas, and code fixes.

This project is developed as an open-source educational and research tool for planning orthopedic surgical procedures. We value clear communication, respectful collaboration, and maintainable code.

## How to Contribute

There are several ways to contribute:

- Report bugs or issues you find while using the application
- Suggest new features or improvements
- Improve documentation, setup instructions, or user guides
- Fix bugs and implement enhancements
- Help review pull requests and provide constructive feedback
- Spread awareness or adoption of this product

Before you begin, please check existing issues and discussions to avoid duplicate work.

## Development Setup

### Prerequisites

Before working on the project, make sure the following tools are installed on your system:

- Git
- Python 3.x
- Node.js and npm
- PostgreSQL for the project database
- SQLite for local development
- A code editor such as VS Code

### Local Setup

1. Fork the repository and clone your fork:

   ```bash
   git clone https://github.com/<your-username>/pao_surgery_simulator
   cd pao_surgery_simulator
   ```

2. Create and switch to a new branch for your work:

   ```bash
   git checkout -b username/patch-name
   ```

3. Set up the backend:

   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate   # On Windows use: venv\Scripts\activate
   pip install -r requirements.txt
   ```

4. Configure the database:

   - Review the backend `database.ini` file and update the values as needed for your local setup.
   - For testing, the defaults may be sufficient, but you should verify they match your environment.
   - Create a PostgreSQL database using your preferred method (for example, pgAdmin or psql) and ensure the credentials align with your configuration.

5. Set up the frontend:

   Open a new terminal and run:

   ```bash
   cd frontend
   npm install
   ```

### Running the Application

1. Start your PostgreSQL database using your preferred method.

2. Start the backend server:

   ```bash
   cd backend
   source venv/bin/activate
   python app.py
   ```

3. In a separate terminal, start the frontend application:

   ```bash
   cd frontend
   npm start
   ```

4. The application should now be running locally, with the frontend available in your browser.

## Workflow and Branching

We use a simple branch-based workflow:

- Create a branch for each task or bug fix
- Keep branch names descriptive and specific
- Prefer small, focused pull requests over large, broad changes

Suggested branch names:

```bash
git checkout -b username/add-user-dashboard
git checkout -b username/login-page-validation
git checkout -b username/setup-guide-update
```

Keep commit messages clear and concise.

## Coding Standards

### Python

- Follow PEP 8 style guidelines
- Use descriptive variable and function names
- Keep functions focused and readable
- Add comments where logic is non-obvious
- Avoid hard-coded secrets or environment-specific values

### JavaScript / React

- Keep code readable and consistent with surrounding project style
- Prefer clear naming and small reusable components
- Avoid unnecessary complexity in UI logic
- Keep dependencies and file structure organized

### Documentation

- Update documentation when changing behavior, configuration, or workflows
- Keep instructions practical and beginner friendly
- Ensure examples are accurate and consistent with the current project

## Testing and Validation

Before submitting a pull request:

- Run relevant tests for the code you changed
- Verify backend and frontend still start correctly
- Check for linting or syntax issues if the project includes them
- Manually test the affected user flow when possible

If you are fixing a bug, please add or update a test when feasible. If you are adding a feature, include validation steps in your pull request description.

### Running Tests Locally

#### Backend testing with pytest

The backend uses pytest for unit and integration tests. To run the backend tests:

```bash
cd backend
source venv/bin/activate   # On Windows use: venv\Scripts\activate
python -m pytest -v
```

To run a specific test file:

```bash
python -m pytest tests/test_specific_module.py -v
```

To run a specific test function:

```bash
python -m pytest tests/test_module.py::test_function_name -v
```

The `-v` flag provides verbose output showing each test result. You can omit it for a more compact summary.

#### Frontend testing with npm

The frontend uses Jest for testing React components. To run the frontend tests:

```bash
cd frontend
npm run test:ci
```

Or to run tests in watch mode:

```bash
npm test
```

To run tests for a specific file or pattern:

```bash
npm test -- test-file-pattern
```

All tests should pass locally before submitting a pull request. The same tests run in CI, and pull requests with failing tests will not be merged.

## Pull Request Guidelines

When starting a feature:

- Create a draft pull request when you begin work. This allows the start of work to be tracked and prevents work from starting on an issue when another is already working on it
- Update the draft as you continue, to keep the changes accurate on the document
- Convert it to a pull request and request a review from the code owner when it is ready

When opening a pull request:

- Use a clear, descriptive title
- Include a summary of the changes
- Mention any issue or feature request being addressed
- Include testing steps or validation performed
- Keep the scope narrow and focused
- Add screenshots or videos for UI-related changes when helpful

A good pull request description usually includes:

- What changed
- Why it changed
- Any implementation notes
- How it was tested

## Reporting Issues

If you find a bug or issue, please open a GitHub issue with:

- A short, clear title
- Steps to reproduce
- Expected behavior
- Actual behavior
- Screenshots or logs, if applicable
- Relevant environment details (browser, OS, versions, etc.)

These are prompted on the issue template.

Before filing a new issue, search existing issues to see whether the problem has already been reported.

## Code of Conduct

This project follows the Contributor Covenant Code of Conduct. Please read the `CODE_OF_CONDUCT.md` file before contributing.

We expect all contributors to engage respectfully and constructively in all project interactions.

## Questions

If you have questions about contributing, project setup, or workflow, please open an issue or contact the project maintainers through the repository discussion channels.

Thank you for helping improve PAO Surgery Simulator.
