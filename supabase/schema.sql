-- ==========================================================
-- MOTEL MANAGEMENT, INVENTORY, MENU & ORDERING SYSTEM
-- PostgreSQL schema for Supabase
-- ==========================================================

-- 1. USERS & ROLES
CREATE TABLE IF NOT EXISTS roles (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permissions (
    id VARCHAR(36) PRIMARY KEY,
    code VARCHAR(100) NOT NULL UNIQUE,
    module VARCHAR(50) NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id VARCHAR(36) NOT NULL,
    permission_id VARCHAR(36) NOT NULL,
    PRIMARY KEY (role_id, permission_id),
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(30),
    role_id VARCHAR(36) NOT NULL,
    is_active INTEGER DEFAULT 1,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id) REFERENCES roles(id)
);

-- 2. GUESTS, ROOMS & RESERVATIONS
CREATE TABLE IF NOT EXISTS room_types (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    code VARCHAR(20) NOT NULL,
    base_price DECIMAL(10, 2) NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 2,
    description TEXT,
    amenities TEXT
);

CREATE TABLE IF NOT EXISTS rooms (
    id VARCHAR(36) PRIMARY KEY,
    room_number VARCHAR(20) NOT NULL UNIQUE,
    floor INTEGER NOT NULL DEFAULT 1,
    room_type_id VARCHAR(36) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'Available', 
    -- Statuses: 'Available', 'Reserved', 'Occupied', 'Dirty', 'Cleaning', 'Clean', 'Maintenance', 'Out of Service'
    current_occupant_id VARCHAR(36),
    price_per_night DECIMAL(10, 2) NOT NULL,
    notes TEXT,
    last_cleaned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_type_id) REFERENCES room_types(id)
);

CREATE TABLE IF NOT EXISTS guests (
    id VARCHAR(36) PRIMARY KEY,
    guest_code VARCHAR(30) NOT NULL UNIQUE,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    email VARCHAR(100),
    id_type VARCHAR(50) DEFAULT 'National ID',
    id_number VARCHAR(100),
    nationality VARCHAR(50) DEFAULT 'Rwandan',
    address TEXT,
    notes TEXT,
    created_by VARCHAR(36),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reservations (
    id VARCHAR(36) PRIMARY KEY,
    reservation_number VARCHAR(30) NOT NULL UNIQUE,
    guest_id VARCHAR(36) NOT NULL,
    room_id VARCHAR(36) NOT NULL,
    check_in_date DATE NOT NULL,
    check_out_date DATE NOT NULL,
    num_guests INTEGER DEFAULT 1,
    total_amount DECIMAL(10, 2) NOT NULL,
    deposit_amount DECIMAL(10, 2) DEFAULT 0.00,
    status VARCHAR(30) NOT NULL DEFAULT 'Confirmed', 
    -- 'Confirmed', 'CheckedIn', 'CheckedOut', 'Cancelled', 'NoShow'
    special_requests TEXT,
    created_by VARCHAR(36),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (guest_id) REFERENCES guests(id),
    FOREIGN KEY (room_id) REFERENCES rooms(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS check_ins (
    id VARCHAR(36) PRIMARY KEY,
    check_in_number VARCHAR(30) NOT NULL UNIQUE,
    reservation_id VARCHAR(36),
    guest_id VARCHAR(36) NOT NULL,
    room_id VARCHAR(36) NOT NULL,
    check_in_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expected_check_out_date DATE NOT NULL,
    actual_check_out_time TIMESTAMPTZ,
    deposit_paid DECIMAL(10, 2) DEFAULT 0.00,
    payment_method VARCHAR(50) DEFAULT 'Cash',
    checked_in_by VARCHAR(36) NOT NULL,
    status VARCHAR(30) DEFAULT 'Active', -- 'Active', 'Completed'
    notes TEXT,
    FOREIGN KEY (reservation_id) REFERENCES reservations(id),
    FOREIGN KEY (guest_id) REFERENCES guests(id),
    FOREIGN KEY (room_id) REFERENCES rooms(id),
    FOREIGN KEY (checked_in_by) REFERENCES users(id)
);

-- 3. INVENTORY MANAGEMENT
CREATE TABLE IF NOT EXISTS inventory_categories (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE, 
    -- 'Cleaning Supplies', 'Linen', 'Kitchen Ingredients', 'Bar/Drinks', 'Other'
    description TEXT
);

CREATE TABLE IF NOT EXISTS suppliers (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    contact_person VARCHAR(100),
    phone VARCHAR(30),
    email VARCHAR(100),
    address TEXT,
    category VARCHAR(50),
    is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS inventory_items (
    id VARCHAR(36) PRIMARY KEY,
    sku VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    category_id VARCHAR(36) NOT NULL,
    department VARCHAR(50) NOT NULL DEFAULT 'General', -- 'Kitchen', 'Bar', 'Housekeeping', 'Manager', 'General'
    unit VARCHAR(30) NOT NULL, -- 'kg', 'portions', 'liters', 'bottles', 'pieces', 'boxes'
    current_quantity DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    reserved_quantity DECIMAL(10, 2) NOT NULL DEFAULT 0.00, -- Reserved for active orders
    minimum_quantity DECIMAL(10, 2) NOT NULL DEFAULT 5.00,
    reorder_quantity DECIMAL(10, 2) NOT NULL DEFAULT 20.00,
    unit_cost DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    supplier_id VARCHAR(36),
    storage_location VARCHAR(100),
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES inventory_categories(id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

CREATE TABLE IF NOT EXISTS inventory_transactions (
    id VARCHAR(36) PRIMARY KEY,
    item_id VARCHAR(36) NOT NULL,
    transaction_type VARCHAR(30) NOT NULL, 
    -- 'Received', 'Issued', 'Consumed', 'Returned', 'Damaged', 'Lost', 'Expired', 'Adjustment'
    quantity DECIMAL(10, 2) NOT NULL,
    previous_quantity DECIMAL(10, 2) NOT NULL,
    new_quantity DECIMAL(10, 2) NOT NULL,
    unit_cost DECIMAL(10, 2),
    total_cost DECIMAL(10, 2),
    reference_id VARCHAR(100), -- Order ID, Stock Request ID, or Purchase PO
    reason TEXT NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES inventory_items(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS stock_requests (
    id VARCHAR(36) PRIMARY KEY,
    request_number VARCHAR(30) NOT NULL UNIQUE,
    department VARCHAR(50) NOT NULL, -- 'Kitchen', 'Bar', 'Housekeeping'
    requested_by VARCHAR(36) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'Pending', -- 'Pending', 'Approved', 'Rejected', 'Fulfilled'
    priority VARCHAR(20) DEFAULT 'Normal', -- 'Low', 'Normal', 'Urgent'
    reason TEXT,
    reviewed_by VARCHAR(36),
    review_notes TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (requested_by) REFERENCES users(id),
    FOREIGN KEY (reviewed_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS stock_request_items (
    id VARCHAR(36) PRIMARY KEY,
    request_id VARCHAR(36) NOT NULL,
    item_id VARCHAR(36) NOT NULL,
    quantity_requested DECIMAL(10, 2) NOT NULL,
    quantity_approved DECIMAL(10, 2) DEFAULT 0.00,
    unit VARCHAR(30),
    FOREIGN KEY (request_id) REFERENCES stock_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES inventory_items(id)
);

-- 4. MENU & RECIPE MAPPING
CREATE TABLE IF NOT EXISTS menu_categories (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE, -- 'Breakfast', 'Lunch', 'Dinner', 'Drinks', 'Snacks', 'Desserts'
    display_order INTEGER DEFAULT 0,
    icon VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS menu_items (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    category_id VARCHAR(36) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    preparation_duration INTEGER DEFAULT 15, -- minutes
    is_active INTEGER DEFAULT 1, -- Manager active flag
    is_available INTEGER DEFAULT 1, -- Availability flag (controlled by chef or auto-stock)
    deactivation_reason TEXT, -- Reason when chef/manager marks unavailable
    deactivated_by VARCHAR(36),
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES menu_categories(id),
    FOREIGN KEY (deactivated_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS menu_item_ingredients (
    id VARCHAR(36) PRIMARY KEY,
    menu_item_id VARCHAR(36) NOT NULL,
    inventory_item_id VARCHAR(36) NOT NULL,
    quantity_required DECIMAL(10, 2) NOT NULL, -- Quantity of inventory item per serving
    unit VARCHAR(30) NOT NULL,
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
    FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id)
);

-- 5. ORDERS & POS (WAITER & ROOM SERVICE)
CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(36) PRIMARY KEY,
    order_number VARCHAR(30) NOT NULL UNIQUE,
    order_type VARCHAR(30) NOT NULL, -- 'Table', 'Room Service', 'Bar Takeaway'
    table_number VARCHAR(20),
    room_id VARCHAR(36),
    guest_id VARCHAR(36),
    waiter_id VARCHAR(36) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'Pending', 
    -- 'Pending', 'Confirmed', 'Preparing', 'Ready', 'Served', 'Completed', 'Cancelled'
    payment_status VARCHAR(30) NOT NULL DEFAULT 'Unpaid', 
    -- 'Unpaid', 'Paid', 'ChargedToRoom', 'Complimentary'
    subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    discount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    tax DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    stock_reserved INTEGER DEFAULT 1,
    stock_consumed INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id),
    FOREIGN KEY (guest_id) REFERENCES guests(id),
    FOREIGN KEY (waiter_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS order_items (
    id VARCHAR(36) PRIMARY KEY,
    order_id VARCHAR(36) NOT NULL,
    menu_item_id VARCHAR(36) NOT NULL,
    menu_item_name VARCHAR(100) NOT NULL, -- Snapshot
    unit_price DECIMAL(10, 2) NOT NULL, -- Historical price snapshot
    quantity INTEGER NOT NULL,
    total_price DECIMAL(10, 2) NOT NULL,
    special_notes TEXT,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
);

-- 6. KITCHEN USAGE & WASTE
CREATE TABLE IF NOT EXISTS kitchen_usage (
    id VARCHAR(36) PRIMARY KEY,
    inventory_item_id VARCHAR(36) NOT NULL,
    quantity DECIMAL(10, 2) NOT NULL,
    unit VARCHAR(30) NOT NULL,
    used_for VARCHAR(100) NOT NULL,
    recorded_by VARCHAR(36) NOT NULL,
    date_recorded TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id),
    FOREIGN KEY (recorded_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS kitchen_waste (
    id VARCHAR(36) PRIMARY KEY,
    inventory_item_id VARCHAR(36) NOT NULL,
    quantity DECIMAL(10, 2) NOT NULL,
    unit VARCHAR(30) NOT NULL,
    cost_loss DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    reason VARCHAR(100) NOT NULL, -- 'Spoiled', 'Burned/Overcooked', 'Expired', 'Dropped', 'Other'
    notes TEXT,
    reported_by VARCHAR(36) NOT NULL,
    date_reported TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id),
    FOREIGN KEY (reported_by) REFERENCES users(id)
);

-- 7. HOUSEKEEPING & MAINTENANCE
CREATE TABLE IF NOT EXISTS maintenance_requests (
    id VARCHAR(36) PRIMARY KEY,
    ticket_number VARCHAR(30) NOT NULL UNIQUE,
    room_id VARCHAR(36),
    location VARCHAR(100),
    issue_type VARCHAR(50) NOT NULL, -- 'Plumbing', 'Electrical', 'Air Conditioning', 'Furniture', 'Damage', 'Other'
    description TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'Medium', -- 'Low', 'Medium', 'High', 'Critical'
    status VARCHAR(30) NOT NULL DEFAULT 'Reported', -- 'Reported', 'In Progress', 'Resolved', 'Closed'
    reported_by VARCHAR(36) NOT NULL,
    assigned_to VARCHAR(100),
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id),
    FOREIGN KEY (reported_by) REFERENCES users(id)
);

-- 8. STAFF SCHEDULING, SHIFT SWAPS & ATTENDANCE
CREATE TABLE IF NOT EXISTS staff_shifts (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    shift_date DATE NOT NULL,
    start_time VARCHAR(10) NOT NULL, -- '07:00'
    end_time VARCHAR(10) NOT NULL,   -- '15:00'
    shift_type VARCHAR(30) NOT NULL DEFAULT 'Morning', -- 'Morning', 'Afternoon', 'Night', 'Full Day'
    department VARCHAR(50) NOT NULL,
    notes TEXT,
    created_by VARCHAR(36),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS shift_swap_requests (
    id VARCHAR(36) PRIMARY KEY,
    requesting_user_id VARCHAR(36) NOT NULL,
    target_user_id VARCHAR(36) NOT NULL,
    shift_id VARCHAR(36) NOT NULL,
    target_shift_id VARCHAR(36),
    reason TEXT NOT NULL,
    target_status VARCHAR(30) DEFAULT 'Pending', -- 'Pending', 'Accepted', 'Declined'
    manager_status VARCHAR(30) DEFAULT 'Pending', -- 'Pending', 'Approved', 'Rejected'
    approved_by VARCHAR(36),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (requesting_user_id) REFERENCES users(id),
    FOREIGN KEY (target_user_id) REFERENCES users(id),
    FOREIGN KEY (shift_id) REFERENCES staff_shifts(id),
    FOREIGN KEY (approved_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS attendance (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    date DATE NOT NULL,
    clock_in TIMESTAMPTZ NOT NULL,
    clock_out TIMESTAMPTZ,
    break_duration_minutes INTEGER DEFAULT 0,
    total_hours DECIMAL(5, 2) DEFAULT 0.00,
    status VARCHAR(30) DEFAULT 'Present', -- 'Present', 'Late', 'Half Day', 'Overtime'
    notes TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 9. INVOICES, PAYMENTS, EXPENSES & REVENUE
CREATE TABLE IF NOT EXISTS invoices (
    id VARCHAR(36) PRIMARY KEY,
    invoice_number VARCHAR(30) NOT NULL UNIQUE,
    guest_id VARCHAR(36) NOT NULL,
    check_in_id VARCHAR(36),
    room_id VARCHAR(36),
    subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    discount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    tax DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    amount_paid DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    balance_due DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(30) NOT NULL DEFAULT 'Unpaid', -- 'Unpaid', 'Partially Paid', 'Paid', 'Cancelled'
    due_date DATE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (guest_id) REFERENCES guests(id),
    FOREIGN KEY (check_in_id) REFERENCES check_ins(id),
    FOREIGN KEY (room_id) REFERENCES rooms(id)
);

CREATE TABLE IF NOT EXISTS invoice_items (
    id VARCHAR(36) PRIMARY KEY,
    invoice_id VARCHAR(36) NOT NULL,
    description VARCHAR(200) NOT NULL,
    item_type VARCHAR(50) NOT NULL, -- 'Room', 'Food', 'Drinks', 'Service', 'Other'
    unit_price DECIMAL(10, 2) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    total_price DECIMAL(10, 2) NOT NULL,
    reference_id VARCHAR(100), -- Order ID or Room ID
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payments (
    id VARCHAR(36) PRIMARY KEY,
    receipt_number VARCHAR(30) NOT NULL UNIQUE,
    invoice_id VARCHAR(36),
    order_id VARCHAR(36),
    guest_id VARCHAR(36),
    amount DECIMAL(10, 2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL, -- 'Cash', 'Credit Card', 'Mobile Money', 'Bank Transfer'
    payment_category VARCHAR(50) NOT NULL, -- 'Room', 'Food', 'Drinks', 'Deposit', 'Other'
    reference_number VARCHAR(100),
    received_by VARCHAR(36) NOT NULL,
    payment_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id),
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (guest_id) REFERENCES guests(id),
    FOREIGN KEY (received_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS expenses (
    id VARCHAR(36) PRIMARY KEY,
    expense_number VARCHAR(30) NOT NULL UNIQUE,
    category VARCHAR(50) NOT NULL, 
    -- 'Food Purchases', 'Drinks', 'Cleaning Supplies', 'Linen', 'Maintenance', 'Utilities', 'Salaries', 'Other'
    title VARCHAR(150) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    payment_method VARCHAR(50) DEFAULT 'Cash',
    supplier_id VARCHAR(36),
    paid_to VARCHAR(100),
    expense_date DATE NOT NULL,
    receipt_reference VARCHAR(100),
    recorded_by VARCHAR(36) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY (recorded_by) REFERENCES users(id)
);

-- 10. NOTIFICATIONS, AUDIT LOGS & SETTINGS
CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(36) PRIMARY KEY,
    type VARCHAR(50) NOT NULL, -- 'low_stock', 'new_order', 'order_status', 'check_in', 'maintenance', 'request'
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    target_role VARCHAR(50), -- 'all', 'manager', 'admin', 'chef', 'housekeeper', 'waiter'
    target_user_id VARCHAR(36),
    is_read INTEGER DEFAULT 0,
    link VARCHAR(200),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36),
    username VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL,
    module VARCHAR(50) NOT NULL, -- 'Auth', 'Rooms', 'Guests', 'Reservations', 'Inventory', 'Menu', 'Orders', 'Housekeeping', 'Staff', 'Finance'
    action VARCHAR(100) NOT NULL, -- 'Created', 'Updated', 'Deleted', 'Status Change', 'Stock Deducted', 'Login'
    record_id VARCHAR(100),
    details TEXT,
    ip_address VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_settings (
    key_name VARCHAR(100) PRIMARY KEY,
    value_json TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 11. AUTHENTICATION SECURITY
CREATE TABLE IF NOT EXISTS token_blacklist (
    token_id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    blacklisted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    reason VARCHAR(100) NOT NULL DEFAULT 'Logout'
);

CREATE TABLE IF NOT EXISTS otp_tokens (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    email VARCHAR(100) NOT NULL,
    otp_code VARCHAR(10) NOT NULL,
    purpose VARCHAR(50) NOT NULL DEFAULT 'login',
    expires_at TIMESTAMPTZ NOT NULL,
    used INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_tokens(email, purpose, used);
CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_tokens(expires_at);

-- 12. RESTAURANT TABLES (POS)
CREATE TABLE IF NOT EXISTS restaurant_tables (
    id VARCHAR(64) PRIMARY KEY,
    table_number VARCHAR(32) NOT NULL UNIQUE,
    seats INTEGER NOT NULL DEFAULT 2,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- INDEXES FOR MAXIMUM QUERY PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_reservations_dates ON reservations(check_in_date, check_out_date, status);
CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory_items(category_id);
CREATE INDEX IF NOT EXISTS idx_inventory_sku ON inventory_items(sku);
CREATE INDEX IF NOT EXISTS idx_menu_category ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, waiter_id);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_audit_module ON audit_logs(module, created_at);

