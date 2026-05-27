# Investment Management System (IMS)

A comprehensive web-based Investment Management System for managing private equity funds, capital calls, and distributions.

## Features

### Dashboard
- **Portfolio Summary**: View total commitments, drawn capital, and key metrics
- **Visual Analytics**: Charts showing commitment vs. drawn capital, capital call status
- **Overdue Alerts**: Automatic detection and highlighting of overdue capital calls
- **FX Tracking**: Real-time USD/JPY exchange rate display

### Fund Management
- **9 Sample Funds**: Pre-loaded with diverse strategies (Buyout, Growth, Venture, Real Estate, Infrastructure, etc.)
- **Fund Creation**: Add new funds with detailed parameters
- **Fund Strategies**: Support for 7+ fund strategies
- **Bilingual Support**: Fund names in both English and Japanese

### Capital Calls
- **Call Management**: Track capital calls across all funds
- **Status Tracking**: Monitor pending, approved, and paid status
- **Multi-currency**: Automatic USD to JPY conversion
- **Due Date Tracking**: Identify and track overdue calls

### Distributions
- **Distribution Tracking**: Monitor capital returns and income distributions
- **Recallable Capital**: Track recallable distributions with expiry dates
- **Multi-type Support**: Capital Returns, Income, and Recallable distributions
- **Historical Records**: Complete transaction history

## Technology Stack

### Backend
- **FastAPI**: Modern Python web framework for building APIs
- **PostgreSQL**: Robust relational database
- **SQLAlchemy**: ORM for database operations
- **Pydantic**: Data validation and settings management

### Frontend
- **React 19**: Latest React framework
- **TypeScript**: Type-safe JavaScript
- **Vite**: Lightning-fast build tool
- **Recharts**: Beautiful data visualization
- **React Router**: Client-side routing
- **Tailwind CSS**: Utility-first CSS framework
- **React Hot Toast**: User notifications
- **React Hook Form**: Efficient form handling

## Project Structure

```
ims-project/
├── backend/
│   ├── app/
│   │   ├── api/v1/
│   │   │   ├── auth.py
│   │   │   ├── capital_calls.py
│   │   │   ├── dashboard.py
│   │   │   ├── distributions.py
│   │   │   ├── funds.py
│   │   │   └── fx_rates.py
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   ├── database.py
│   │   │   └── security.py
│   │   ├── models/
│   │   │   ├── audit_log.py
│   │   │   ├── capital_call.py
│   │   │   ├── distribution.py
│   │   │   ├── fund.py
│   │   │   ├── fx_rate.py
│   │   │   └── user.py
│   │   ├── scripts/
│   │   │   └── seed_data.py
│   │   ├── services/
│   │   │   ├── audit_service.py
│   │   │   └── calculation_engine.py
│   │   └── main.py
│   ├── alembic/
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AddFundModal.tsx
│   │   │   ├── Layout.tsx
│   │   │   └── StatCard.tsx
│   │   ├── pages/
│   │   │   ├── CapitalCalls.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Distributions.tsx
│   │   │   ├── FundDetail.tsx
│   │   │   └── FundManagement.tsx
│   │   ├── services/
│   │   │   └── api.ts
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── package.json
│   └── vite.config.ts
├── docker-compose.yml
└── README.md
```

## Getting Started

### Prerequisites
- Python 3.9+
- Node.js 18+
- PostgreSQL 12+
- Docker & Docker Compose (optional)

### Backend Setup

1. **Install dependencies**:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

2. **Setup environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Initialize database**:
   ```bash
   alembic upgrade head
   ```

4. **Seed sample data**:
   ```bash
   python -m app.scripts.seed_data
   ```

5. **Run development server**:
   ```bash
   python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

The API will be available at `http://localhost:8000/docs` (Swagger UI)

### Frontend Setup

1. **Install dependencies**:
   ```bash
   cd frontend
   npm install
   ```

2. **Create environment file**:
   ```bash
   cp .env.example .env
   # Set VITE_API_URL=http://localhost:8000/api/v1
   ```

3. **Start development server**:
   ```bash
   npm run dev
   ```

The frontend will be available at `http://localhost:5173`

### Using Docker Compose

```bash
docker-compose up --build
```

This will start:
- PostgreSQL (port 5432)
- Backend API (port 8000)
- Frontend (port 5173)

## Sample Data

The system comes with:
- **9 Pre-loaded Funds** with different strategies
- **27 Capital Calls** (3 per fund with various statuses)
- **18 Distributions** (2 per fund)
- **Sample FX Rates** (12 months of historical data)
- **4 Sample Users** (Admin, Manager, Staff, CEO)

## API Endpoints

### Authentication
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/logout` - User logout

### Funds
- `GET /api/v1/funds` - List all active funds
- `POST /api/v1/funds` - Create new fund
- `GET /api/v1/funds/{id}` - Get fund details
- `PUT /api/v1/funds/{id}` - Update fund

### Capital Calls
- `GET /api/v1/capital-calls` - List capital calls
- `POST /api/v1/capital-calls` - Create capital call
- `GET /api/v1/capital-calls/{id}` - Get capital call details
- `PATCH /api/v1/capital-calls/{id}/approve` - Approve capital call
- `PATCH /api/v1/capital-calls/{id}/mark-paid` - Mark as paid

### Distributions
- `GET /api/v1/distributions/fund/{fund_id}` - List fund distributions
- `POST /api/v1/distributions` - Create distribution
- `PUT /api/v1/distributions/{id}` - Update distribution
- `DELETE /api/v1/distributions/{id}` - Delete distribution

### Dashboard
- `GET /api/v1/dashboard/summary` - Get dashboard summary

### FX Rates
- `GET /api/v1/fx-rates` - List recent FX rates
- `GET /api/v1/fx-rates/latest` - Get latest rate
- `POST /api/v1/fx-rates` - Add new FX rate

## Key Features Explained

### Multi-currency Support
- Automatic conversion between USD and JPY
- Real-time FX rate tracking
- Historical rate records for auditing

### Capital Call Workflow
1. Create capital call (Pending)
2. Approve call (Approved)
3. Mark as paid (Paid)
4. Automatic calculation of net amounts

### Fund Strategies Supported
- Buyout
- Growth
- Venture
- Secondaries
- Private Credit
- Real Estate
- Infrastructure

### Audit Trail
- All transactions logged with user information
- Complete history of modifications
- Timestamp tracking for compliance

## User Roles

- **Admin**: Full system access
- **Finance Manager**: Fund and capital call management
- **Finance Staff**: Data entry and viewing
- **CEO**: Dashboard and reporting
- **Board Member**: Read-only access

## Calculations

The system automatically calculates:
- **Net Capital Call**: Gross call - Distribution - Subsequent close interest
- **JPY Conversion**: USD amount × FX rate
- **Drawn Percentage**: (Total drawn / Total commitment) × 100
- **Unfunded Amount**: Total commitment - Total drawn + Recallable
- **DPI**: (Total distributions / Total invested)
- **XIRR**: Internal rate of return calculation

## Best Practices

1. **FX Rates**: Always update monthly FX rates before creating capital calls
2. **Capital Calls**: Follow the workflow (Create → Approve → Mark Paid)
3. **Distributions**: Record distributions as they are received
4. **Fund Setup**: Complete all fund details at creation for accurate calculations
5. **Backups**: Regular database backups recommended

## Troubleshooting

### Backend won't start
- Check PostgreSQL is running
- Verify database credentials in .env
- Run migrations: `alembic upgrade head`

### Frontend build fails
- Clear node_modules: `rm -rf node_modules && npm install`
- Clear cache: `npm cache clean --force`

### API connection issues
- Verify backend is running on port 8000
- Check CORS settings in main.py
- Verify VITE_API_URL in frontend .env

## Development

### Adding a New Page
1. Create component in `src/pages/`
2. Add CSS file for styling
3. Add route in `App.tsx`
4. Add navigation link in `Layout.tsx`

### Adding a New API Endpoint
1. Create route in appropriate module under `api/v1/`
2. Register router in `main.py`
3. Create Pydantic models for request/response
4. Add API client function in `services/api.ts`

## Performance Considerations

- Database indexes on fund_id, due_date, status
- Pagination for large datasets
- Caching of FX rates and fund summaries
- Lazy loading of distributions

## Security

- CORS protection enabled
- Password hashing using bcrypt
- SQL injection prevention via SQLAlchemy
- Input validation with Pydantic
- JWT-based authentication (when enabled)

## Contributing

1. Create feature branch
2. Make changes with clear commit messages
3. Add tests for new features
4. Submit pull request

## License

Proprietary - Investment Management System

## Support

For issues or questions, please contact the development team.

---

**Last Updated**: May 2024
**Version**: 1.0.0
