# Data Model Proposal

## Master data

### Organizations

Fields:

- id
- code
- name
- active_flag

### Departments

Fields:

- id
- organization_id
- code
- name
- active_flag

### Employees

Fields:

- id
- employee_number
- full_name
- organization_id
- department_id
- labor_category_id
- default_rate_table_id
- manager_id
- active_flag

### Labor categories

Fields:

- id
- code
- name
- group_name
- billable_flag

### Vendors

Fields:

- id
- vendor_code
- vendor_name
- active_flag

### Equipment catalog

Fields:

- id
- equipment_code
- equipment_name
- default_unit
- default_rate

### Material catalog

Fields:

- id
- item_code
- item_name
- uom
- default_unit_cost

## Project controls data

### Projects

Fields:

- id
- project_code
- project_name
- client_name
- organization_id
- manager_id
- contract_type
- contract_value
- funded_value
- start_date
- end_date

### WBS

Fields:

- id
- project_id
- parent_id
- wbs_code
- wbs_name

### Cost codes

Fields:

- id
- project_id
- code
- description
- category

### Forecast versions

Fields:

- id
- project_id
- version_code
- version_name
- status
- as_of_period
- created_at
- submitted_at
- approved_at

Statuses:

- Working
- Submitted
- Approved
- Frozen

## Planning lines

### Labor plan lines

Fields:

- id
- forecast_version_id
- project_id
- employee_id
- labor_category_id
- organization_id
- department_id
- wbs_id
- cost_code_id
- rate
- month_01_hours through month_12_hours

### Sub plan lines

Fields:

- id
- forecast_version_id
- project_id
- vendor_id
- line_description
- wbs_id
- cost_code_id
- month_01_cost through month_12_cost

### Equipment plan lines

Fields:

- id
- forecast_version_id
- project_id
- equipment_catalog_id
- line_description
- unit
- rate
- wbs_id
- cost_code_id
- month_01_units through month_12_units

### Material plan lines

Fields:

- id
- forecast_version_id
- project_id
- material_catalog_id
- line_description
- uom
- unit_cost
- wbs_id
- cost_code_id
- month_01_qty through month_12_qty

### ODC plan lines

Fields:

- id
- forecast_version_id
- project_id
- odc_type
- line_description
- wbs_id
- cost_code_id
- month_01_cost through month_12_cost

## Actuals and integration

### Import batches

Fields:

- id
- source_system
- run_at
- status
- row_count
- error_count

### Raw import rows

Fields:

- id
- import_batch_id
- source_key
- source_project_ref
- source_account_ref
- source_class_ref
- source_item_ref
- transaction_date
- amount
- mapped_project_id
- mapped_cost_category
- mapped_cost_code_id
- mapped_employee_id
- mapping_status

### Monthly actual facts

Fields:

- id
- project_id
- actual_period
- category
- cost_code_id
- employee_id
- vendor_id
- amount

## Review and governance

### Forecast review notes

Fields:

- id
- forecast_version_id
- category
- cost_code_id
- note_type
- note_text
- owner_id

### Audit events

Fields:

- id
- entity_name
- entity_id
- action_type
- action_user_id
- action_timestamp
- old_value_json
- new_value_json
