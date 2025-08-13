# TranSync FTZ Warehouse Management System - AI Agent Instructions

## Architecture Overview

TranSync is a multi-tenant bonded warehouse management system with **4 distinct client modules** that share common infrastructure but have separate authentication and permission boundaries:

- **OMP** (`/api/omp`): Operations Management Platform - multi-warehouse admin, user/role management, global analytics
- **WMS** (`/api/wms`): Warehouse Management System - local warehouse operations (scanning, inventory, palletization)
- **Agent** (`/api/agent`): Freight forwarder interface - shipment creation, HAWB/MAWB management, customs documentation
- **Client** (`/api/client`): Customer portal - package tracking, inbound declarations, delivery scheduling

### Multi-Module Router Pattern

The system uses a **dynamic module loader** (`utils/createClientAppRouter.js`) that:

- Mounts each module at `/api/{clientType}` with module-specific middleware
- Applies different authentication patterns (Client uses special login bypass, others require system permissions)
- Each module has its own `routes/{clientType}/index.js` entry point

## Core Development Patterns

### 1. Unified Configuration System

**CRITICAL**: Always use the centralized config system, never direct `process.env`:

```javascript
import config from "../config/environment.js";

// ✅ Correct
const dbHost = config.database.host;
const jwtSecret = config.jwt.secret;

// ❌ Never do this
const dbHost = process.env.DB_HOST;
```

The config system provides type conversion, validation, and health checks.

### 2. Permission-Based Access Control

**Three-tier permission system**:

- **Module access**: `{module}.access` (e.g., `omp.access`, `warehouse.access`)
- **Feature permissions**: `{module}.{feature}.{action}` (e.g., `warehouse.pallet.create`)
- **Client permissions**: Embedded in JWT tokens, validated by `checkPermission` middleware

```javascript
// Route protection pattern
router.post(
  "/pallets",
  authenticate,
  checkPermission("warehouse.pallet.create"),
  async (req, res) => {
    /* handler */
  }
);
```

### 3. Database Transaction Patterns

**Always use transactions for multi-table operations**:

```javascript
const transaction = await db.sequelize.transaction();
try {
  // Multiple database operations
  await Model1.create(data1, { transaction });
  await Model2.update(data2, where, { transaction });

  await transaction.commit();
  res.json({ success: true });
} catch (error) {
  await transaction.rollback();
  res.status(500).json({ error: error.message });
}
```

### 4. Model Association Patterns

**Key relationships to understand**:

- **Package** ↔ **OperationRequirement** (many-to-many via `PackageOperationRequirement`)
- **Package** → **PalletAllocation** (via `assigned_pallet_number`)
- **Forecast** → **Package** (one-to-many, contains MAWB/client info)
- **Package** → **WarehouseLocation** (via pallet allocation)

## Critical Business Logic

### 1. MAWB/HAWB Synchronization

When updating forecast MAWB, **automatically sync to all packages**:

```javascript
// Update forecast MAWB → triggers package MAWB sync
await Package.update(
  { mawb: newMawb },
  { where: { forecast_id: forecastId }, transaction }
);
```

### 2. Package Status Workflows

**Status progression**: `created` → `confirmed` → `arrived` → `stored` → `picked_up` → `delivered`

### 3. Pallet Allocation System

- Packages assigned to pallets via `assigned_pallet_number`
- Warehouse locations track pallet capacity and occupancy
- Special requirements (cold storage, hazmat, oversized) handled via `WarehouseLocation.location_type`

## Development Workflows

### 1. Start Development Server

```bash
cd Backend
node index.js  # Uses config/environment.js for setup
```

### 2. Database Schema Sync

```bash
# Enable in .env
SYNC_DB=true

# Or manual sync
node -e "import('./models/index.js').then(({default: db}) => db.sequelize.sync({alter: true}))"
```

### 3. Seed Permissions

```bash
npm run seed:permissions  # Creates roles/permissions from seed/permissions.js
```

### 4. Testing API Endpoints

Use the provided Postman collections:

- `TranSync_Client_API.postman_collection.json` - Client module testing
- `TranSync_Complete_Client_API.postman_collection.json` - Comprehensive API tests

## Integration Points

### 1. External Systems

- **MySQL Database**: Remote host (162.250.124.22) - handle connection failures gracefully
- **JWT Authentication**: Shared across all modules with different permission sets
- **Moment-timezone**: Global timezone handling for international clients

### 2. Cross-Module Communication

- **Common routes** (`/api/common`): Shared utilities like operation requirements
- **Permission inheritance**: Client permissions embedded in JWT, system permissions queried from database
- **MAWB synchronization**: Changes in Agent/OMP modules affect Client package data

## File Organization Conventions

### 1. Route Structure

```
routes/
├── {module}/index.js     # Module entry point with authentication setup
├── {module}/feature.js   # Feature-specific routes
├── common/              # Cross-module shared endpoints
└── auth/               # System authentication
```

### 2. Model Naming

- **PascalCase** for model classes (`OperationRequirement`)
- **snake_case** for database columns (`operation_requirement_id`)
- **camelCase** for associations (`operationRequirements`)

### 3. Documentation Pattern

Comprehensive API docs in `docs/` directory with **real examples**:

- `hawb_management_api_guide.md`
- `Pallet-Allocation-Management.md`
- `Operation-Requirements-Management.md`

## Common Pitfalls

1. **Don't bypass the config system** - always use `config.database.host` not `process.env.DB_HOST`
2. **Check model associations** - ensure `PackageOperationRequirement` associations are uncommented after debugging
3. **Handle client authentication specially** - Client module has different auth flow than other modules
4. **Use transactions consistently** - especially for pallet allocation and package updates
5. **Mind the timezone handling** - use `moment-timezone` for date operations involving global clients

## Emergency Procedures

### 1. Model Loading Issues

Check for empty model files (e.g., `InbondLog.js` was empty):

```bash
find models/ -name "*.js" -size 0  # Find empty model files
```

### 2. Permission System Reset

```bash
node seed/initPermissionsAndRoles.js  # Rebuild permissions from scratch
```

### 3. Database Connection Issues

```bash
node test-env.js  # Verify database connectivity and config
```
