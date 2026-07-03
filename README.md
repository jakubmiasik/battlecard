# Technology Battlecard

A web application for structured technology comparison using weighted scorecard methodology.

## Features

- **Technology Comparison**: Compare multiple technologies side-by-side across 10 categories and 55+ criteria
- **Weighted Scoring**: Adjust category weights based on use case importance (1-5 score: Poor → Excellent)
- **Reference Answers**: Admins can pre-fill scores for technologies that auto-populate into new comparisons
- **Role-Based Access**: Entra ID authentication with admin/explorer roles
- **Save/Load**: All comparisons saved to Azure SQL database
- **Final Recommendations**: Weighted score calculation with visual results dashboard

## Scorecard Categories

| Category | Criteria Count |
|----------|---------------|
| Business fit | 5 |
| Ingestion | 5 |
| Processing | 5 |
| Architecture | 6 |
| Governance | 7 |
| Security | 6 |
| Operations | 6 |
| Usability | 4 |
| Cost | 6 |
| Future | 4 |

## Tech Stack

- **Frontend**: React + TypeScript + Vite + MSAL React
- **Backend**: Node.js + Express + TypeScript
- **Database**: Azure SQL Server (Managed Identity)
- **Auth**: Microsoft Entra ID

## Setup

### Prerequisites

- Node.js 18+
- Azure SQL Server with managed identity access
- Entra ID app registration

### 1. Configure Environment

```bash
# Server
cp server/.env.example server/.env
# Edit server/.env with your values

# Client
cp client/.env.example client/.env
# Edit client/.env with your Entra ID client ID
```

### 2. Entra ID App Registration

1. Go to Azure Portal → Entra ID → App registrations → New registration
2. Set redirect URI: `http://localhost:5173` (SPA)
3. Under API permissions, add `User.Read`
4. Under "Expose an API", add scope `access_as_user`
5. Copy Application (client) ID to both `.env` files

### 3. Azure SQL Database

Ensure your managed identity has access:

```sql
CREATE USER [your-app-identity] FROM EXTERNAL PROVIDER;
ALTER ROLE db_datareader ADD MEMBER [your-app-identity];
ALTER ROLE db_datawriter ADD MEMBER [your-app-identity];
ALTER ROLE db_ddladmin ADD MEMBER [your-app-identity];
```

### 4. Install & Run

```bash
npm install
npm run dev
```

Server runs on `http://localhost:3001`, client on `http://localhost:5173`.

## Usage

1. **Sign in** with your Microsoft account
2. **Create a comparison** → enter client name, use case, select technologies
3. **Set category weights** based on use case importance
4. **Score each criterion** (1-5) for each technology with justifications
5. **View results** → weighted final scores and recommendation

### Admin Panel

- **Users & Roles**: Grant admin or explorer access
- **Technologies**: Add/manage global technologies
- **Reference Answers**: Pre-fill scores for technologies (auto-populated in new comparisons)

## Scoring Formula

```
Category Score = Average of all criteria scores in category
Final Score = Σ(Category Score × Weight) / Σ(Weight)
```

Score labels: 1=Poor, 2=Weak, 3=Acceptable, 4=Strong, 5=Excellent
