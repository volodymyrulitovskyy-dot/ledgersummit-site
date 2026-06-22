# Forecast Review Workflow

## Objective

Create a repeatable monthly process so EAC is reviewed, explained, and approved with discipline.

## Monthly cycle

### 1. Load actuals

- import QuickBooks data for the closed period
- validate mapping coverage
- resolve unmapped or rejected rows
- publish actuals for the closed month

### 2. Update working forecast

Area owners update forecast for:

- labor
- sub
- equipment
- material
- ODC

Updates should focus on ETC, not rewriting history.

### 3. Review drivers of change

The system should require explanation for material movement:

- labor hours changed
- rate changed
- quantity changed
- unit cost changed
- risk added
- scope changed
- change order pending

### 4. PM and project controls review

Review should compare:

- current working forecast
- prior approved forecast
- approved budget
- current actuals

### 5. Submit forecast

Submission should freeze the proposed version and record:

- who submitted
- as-of period
- review notes
- total EAC and key variances

### 6. Approve forecast

Approval should mark the official forecast for that period and retain prior versions for comparison.

## Required system behaviors

- actual periods are locked from editing
- forecast periods remain editable until submission
- all material changes are auditable
- variance explanations are stored with the review
- dashboard always indicates which version is being viewed

## Dashboard tie-in

The dashboard should always display:

- actual period closed through
- current approved forecast version
- working forecast version, if different
- movement vs prior approved forecast
- unresolved review exceptions
