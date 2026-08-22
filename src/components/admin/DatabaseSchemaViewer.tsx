import React, { useState } from 'react';
import {
  Database,
  Table,
  Key,
  Shield,
  FileCode,
  Copy,
  Check,
  Layers,
  ArrowRight,
  Sparkles,
  RefreshCw,
  Server
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useCms } from '../../context/CmsContext';

export const DatabaseSchemaViewer: React.FC = () => {
  const { success } = useToast();
  const { getSetting } = useCms();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'tables' | 'erd' | 'ddl' | 'triggers'>('tables');
  const [selectedTable, setSelectedTable] = useState<string>('orders');

  const TABLES_SCHEMA = [
    {
      name: 'users',
      category: 'Auth & RBAC',
      description: 'Stores staff accounts, hashed passwords and assigned roles',
      columns: [
        { name: 'id', type: 'VARCHAR(36)', key: 'PK', nullable: 'NO', desc: 'UUID Primary Key' },
        { name: 'username', type: 'VARCHAR(50)', key: 'UNI', nullable: 'NO', desc: 'Unique login handle' },
        { name: 'password_hash', type: 'VARCHAR(255)', key: '', nullable: 'NO', desc: 'Argon2 / BCrypt hash' },
        { name: 'full_name', type: 'VARCHAR(100)', key: '', nullable: 'NO', desc: 'Full display name' },
        { name: 'role', type: "ENUM('admin','manager','chef','housekeeper','waiter')", key: 'IDX', nullable: 'NO', desc: 'System RBAC role' },
        { name: 'email', type: 'VARCHAR(100)', key: '', nullable: 'YES', desc: 'Staff email' },
        { name: 'phone', type: 'VARCHAR(30)', key: '', nullable: 'YES', desc: 'Staff contact phone' },
        { name: 'is_active', type: 'TINYINT(1)', key: '', nullable: 'NO', desc: 'Account active flag (1=active)' },
        { name: 'created_at', type: 'DATETIME', key: '', nullable: 'NO', desc: 'Creation timestamp' },
      ],
    },
    {
      name: 'rooms',
      category: 'Front Desk',
      description: 'Physical motel guest rooms with real-time status and floor mapping',
      columns: [
        { name: 'id', type: 'VARCHAR(36)', key: 'PK', nullable: 'NO', desc: 'UUID Primary Key' },
        { name: 'room_number', type: 'VARCHAR(10)', key: 'UNI', nullable: 'NO', desc: 'Room number identifier' },
        { name: 'room_type_id', type: 'VARCHAR(36)', key: 'FK', nullable: 'NO', desc: 'FK -> room_types(id)' },
        { name: 'floor', type: 'INT', key: '', nullable: 'NO', desc: 'Motel building floor level' },
        { name: 'status', type: "ENUM('Available','Occupied','Reserved','Dirty','Cleaning','Maintenance')", key: 'IDX', nullable: 'NO', desc: 'Live operational status' },
        { name: 'notes', type: 'TEXT', key: '', nullable: 'YES', desc: 'Special features or room notes' },
        { name: 'last_cleaned_at', type: 'DATETIME', key: '', nullable: 'YES', desc: 'Timestamp of last inspection' },
      ],
    },
    {
      name: 'room_types',
      category: 'Front Desk',
      description: 'Categorization of rooms with base rates, capacity, and amenities',
      columns: [
        { name: 'id', type: 'VARCHAR(36)', key: 'PK', nullable: 'NO', desc: 'UUID Primary Key' },
        { name: 'name', type: 'VARCHAR(50)', key: 'UNI', nullable: 'NO', desc: 'Single, Double, Deluxe Suite' },
        { name: 'base_price', type: 'DECIMAL(10,2)', key: '', nullable: 'NO', desc: 'Nightly rack rate in USD' },
        { name: 'capacity', type: 'INT', key: '', nullable: 'NO', desc: 'Max guest occupancy' },
        { name: 'description', type: 'TEXT', key: '', nullable: 'YES', desc: 'Bed configuration and amenities' },
        { name: 'amenities', type: 'JSON', key: '', nullable: 'YES', desc: 'WiFi, AC, TV, Mini-Fridge' },
      ],
    },
    {
      name: 'guests',
      category: 'CRM',
      description: 'Motel guest profiles, passport numbers, and stay records',
      columns: [
        { name: 'id', type: 'VARCHAR(36)', key: 'PK', nullable: 'NO', desc: 'UUID Primary Key' },
        { name: 'full_name', type: 'VARCHAR(100)', key: 'IDX', nullable: 'NO', desc: 'Guest legal name' },
        { name: 'identification_number', type: 'VARCHAR(50)', key: 'IDX', nullable: 'YES', desc: 'National ID or Passport' },
        { name: 'phone', type: 'VARCHAR(30)', key: '', nullable: 'YES', desc: 'Contact mobile number' },
        { name: 'email', type: 'VARCHAR(100)', key: '', nullable: 'YES', desc: 'Guest email address' },
        { name: 'nationality', type: 'VARCHAR(50)', key: '', nullable: 'YES', desc: 'Country of citizenship' },
        { name: 'special_preferences', type: 'TEXT', key: '', nullable: 'YES', desc: 'Dietary, high floor, extra pillows' },
      ],
    },
    {
      name: 'reservations',
      category: 'Front Desk',
      description: 'Booking engine records with stay durations, status & check-in timestamps',
      columns: [
        { name: 'id', type: 'VARCHAR(36)', key: 'PK', nullable: 'NO', desc: 'UUID Primary Key' },
        { name: 'reservation_number', type: 'VARCHAR(20)', key: 'UNI', nullable: 'NO', desc: 'Reference code (e.g. RES-2026-001)' },
        { name: 'guest_id', type: 'VARCHAR(36)', key: 'FK', nullable: 'NO', desc: 'FK -> guests(id)' },
        { name: 'room_id', type: 'VARCHAR(36)', key: 'FK', nullable: 'NO', desc: 'FK -> rooms(id)' },
        { name: 'check_in_date', type: 'DATE', key: 'IDX', nullable: 'NO', desc: 'Planned arrival date' },
        { name: 'check_out_date', type: 'DATE', key: 'IDX', nullable: 'NO', desc: 'Planned departure date' },
        { name: 'actual_check_in', type: 'DATETIME', key: '', nullable: 'YES', desc: 'Actual check-in execution' },
        { name: 'actual_check_out', type: 'DATETIME', key: '', nullable: 'YES', desc: 'Actual checkout execution' },
        { name: 'status', type: "ENUM('Pending','Confirmed','CheckedIn','CheckedOut','Cancelled')", key: 'IDX', nullable: 'NO', desc: 'Reservation lifecycle state' },
        { name: 'total_amount', type: 'DECIMAL(10,2)', key: '', nullable: 'NO', desc: 'Total accommodation cost' },
        { name: 'deposit_paid', type: 'DECIMAL(10,2)', key: '', nullable: 'NO', desc: 'Upfront deposit received' },
      ],
    },
    {
      name: 'menu_items',
      category: 'F&B POS',
      description: 'Restaurant and bar catalog with pricing, category and live availability toggle',
      columns: [
        { name: 'id', type: 'VARCHAR(36)', key: 'PK', nullable: 'NO', desc: 'UUID Primary Key' },
        { name: 'name', type: 'VARCHAR(100)', key: 'IDX', nullable: 'NO', desc: 'Dish / drink name' },
        { name: 'category', type: "ENUM('Food','Beverage','Alcohol','Dessert','Snack')", key: 'IDX', nullable: 'NO', desc: 'Menu section' },
        { name: 'price', type: 'DECIMAL(10,2)', key: '', nullable: 'NO', desc: 'Sales price in USD' },
        { name: 'is_active', type: 'TINYINT(1)', key: 'IDX', nullable: 'NO', desc: 'Chef instant toggle (1=Available, 0=Out of stock)' },
        { name: 'description', type: 'TEXT', key: '', nullable: 'YES', desc: 'Menu description & allergens' },
        { name: 'preparation_time_minutes', type: 'INT', key: '', nullable: 'NO', desc: 'Est. kitchen prep duration' },
      ],
    },
    {
      name: 'recipes',
      category: 'Inventory',
      description: 'BOM (Bill of Materials) linking menu items to inventory ingredient deductions',
      columns: [
        { name: 'id', type: 'VARCHAR(36)', key: 'PK', nullable: 'NO', desc: 'UUID Primary Key' },
        { name: 'menu_item_id', type: 'VARCHAR(36)', key: 'FK', nullable: 'NO', desc: 'FK -> menu_items(id)' },
        { name: 'inventory_item_id', type: 'VARCHAR(36)', key: 'FK', nullable: 'NO', desc: 'FK -> inventory_items(id)' },
        { name: 'quantity_required', type: 'DECIMAL(10,3)', key: '', nullable: 'NO', desc: 'Unit deduction per serving' },
      ],
    },
    {
      name: 'orders',
      category: 'F&B POS',
      description: 'Food & Beverage customer tickets with waiter attribution & kitchen states',
      columns: [
        { name: 'id', type: 'VARCHAR(36)', key: 'PK', nullable: 'NO', desc: 'UUID Primary Key' },
        { name: 'order_number', type: 'VARCHAR(20)', key: 'UNI', nullable: 'NO', desc: 'Order code (e.g. ORD-1001)' },
        { name: 'order_type', type: "ENUM('Table','RoomService')", key: '', nullable: 'NO', desc: 'Table or Room service' },
        { name: 'table_number', type: 'VARCHAR(10)', key: '', nullable: 'YES', desc: 'Dine-in table identifier' },
        { name: 'room_id', type: 'VARCHAR(36)', key: 'FK', nullable: 'YES', desc: 'FK -> rooms(id) for room service' },
        { name: 'waiter_id', type: 'VARCHAR(36)', key: 'FK', nullable: 'NO', desc: 'FK -> users(id) server' },
        { name: 'status', type: "ENUM('Pending','Confirmed','Preparing','Ready','Served','Completed','Cancelled')", key: 'IDX', nullable: 'NO', desc: 'Live kitchen & delivery state' },
        { name: 'payment_status', type: "ENUM('Unpaid','Paid','ChargedToRoom','Refunded')", key: 'IDX', nullable: 'NO', desc: 'Payment settlement' },
        { name: 'total_amount', type: 'DECIMAL(10,2)', key: '', nullable: 'NO', desc: 'Final billed ticket amount' },
        { name: 'created_at', type: 'DATETIME', key: 'IDX', nullable: 'NO', desc: 'Timestamp placed' },
      ],
    },
    {
      name: 'inventory_items',
      category: 'Inventory',
      description: 'Central raw materials, ingredients, beverages and housekeeping supplies',
      columns: [
        { name: 'id', type: 'VARCHAR(36)', key: 'PK', nullable: 'NO', desc: 'UUID Primary Key' },
        { name: 'name', type: 'VARCHAR(100)', key: 'IDX', nullable: 'NO', desc: 'Item name (Beef, Tilapia, Soap)' },
        { name: 'sku', type: 'VARCHAR(50)', key: 'UNI', nullable: 'NO', desc: 'Stock keeping unit code' },
        { name: 'category', type: "ENUM('Kitchen Raw','Beverage','Housekeeping','Maintenance','Linen')", key: 'IDX', nullable: 'NO', desc: 'Inventory segment' },
        { name: 'quantity_on_hand', type: 'DECIMAL(10,2)', key: '', nullable: 'NO', desc: 'Current physical quantity' },
        { name: 'unit_of_measure', type: 'VARCHAR(20)', key: '', nullable: 'NO', desc: 'kg, liters, bottles, units' },
        { name: 'reorder_level', type: 'DECIMAL(10,2)', key: '', nullable: 'NO', desc: 'Low-stock threshold trigger' },
        { name: 'unit_cost', type: 'DECIMAL(10,2)', key: '', nullable: 'NO', desc: 'Purchase cost per unit' },
      ],
    },
    {
      name: 'audit_logs',
      category: 'Security',
      description: 'Immutable system event log for regulatory compliance and fraud prevention',
      columns: [
        { name: 'id', type: 'VARCHAR(36)', key: 'PK', nullable: 'NO', desc: 'UUID Primary Key' },
        { name: 'user_id', type: 'VARCHAR(36)', key: 'FK', nullable: 'YES', desc: 'FK -> users(id)' },
        { name: 'action', type: 'VARCHAR(50)', key: 'IDX', nullable: 'NO', desc: 'INSERT, UPDATE, DELETE, VOID' },
        { name: 'table_name', type: 'VARCHAR(50)', key: 'IDX', nullable: 'NO', desc: 'Target relational entity' },
        { name: 'record_id', type: 'VARCHAR(36)', key: '', nullable: 'YES', desc: 'Affected primary key' },
        { name: 'notes', type: 'TEXT', key: '', nullable: 'YES', desc: 'Contextual payload / before & after diff' },
        { name: 'created_at', type: 'DATETIME', key: 'IDX', nullable: 'NO', desc: 'Event timestamp' },
      ],
    },
  ];

  const MYSQL_DDL = `-- ==========================================================
-- ${getSetting('site_title', 'GRAND HORIZON MOTEL & BISTRO')} MANAGEMENT SYSTEM
-- Relational MySQL Schema (3NF Normalized, InnoDB Engine)
-- ==========================================================

CREATE DATABASE IF NOT EXISTS grand_horizon_motel 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

USE grand_horizon_motel;

-- 1. USERS & RBAC TABLE
CREATE TABLE users (
  id VARCHAR(36) PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  role ENUM('admin', 'manager', 'chef', 'housekeeper', 'waiter') NOT NULL,
  email VARCHAR(100),
  phone VARCHAR(30),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_role (role),
  INDEX idx_users_active (is_active)
) ENGINE=InnoDB;

-- 2. ROOM TYPES
CREATE TABLE room_types (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  base_price DECIMAL(10,2) NOT NULL,
  capacity INT NOT NULL DEFAULT 2,
  description TEXT,
  amenities JSON,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 3. ROOMS
CREATE TABLE rooms (
  id VARCHAR(36) PRIMARY KEY,
  room_number VARCHAR(10) NOT NULL UNIQUE,
  room_type_id VARCHAR(36) NOT NULL,
  floor INT NOT NULL DEFAULT 1,
  status ENUM('Available', 'Occupied', 'Reserved', 'Dirty', 'Cleaning', 'Maintenance') NOT NULL DEFAULT 'Available',
  notes TEXT,
  last_cleaned_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_type_id) REFERENCES room_types(id) ON DELETE RESTRICT,
  INDEX idx_rooms_status (status),
  INDEX idx_rooms_floor (floor)
) ENGINE=InnoDB;

-- 4. GUESTS CRM
CREATE TABLE guests (
  id VARCHAR(36) PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  identification_number VARCHAR(50),
  phone VARCHAR(30),
  email VARCHAR(100),
  nationality VARCHAR(50),
  special_preferences TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_guests_name (full_name),
  INDEX idx_guests_idnum (identification_number)
) ENGINE=InnoDB;

-- 5. RESERVATIONS
CREATE TABLE reservations (
  id VARCHAR(36) PRIMARY KEY,
  reservation_number VARCHAR(20) NOT NULL UNIQUE,
  guest_id VARCHAR(36) NOT NULL,
  room_id VARCHAR(36) NOT NULL,
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  actual_check_in DATETIME,
  actual_check_out DATETIME,
  status ENUM('Pending', 'Confirmed', 'CheckedIn', 'CheckedOut', 'Cancelled') NOT NULL DEFAULT 'Pending',
  total_amount DECIMAL(10,2) NOT NULL,
  deposit_paid DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  special_requests TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE RESTRICT,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE RESTRICT,
  INDEX idx_res_dates (check_in_date, check_out_date),
  INDEX idx_res_status (status)
) ENGINE=InnoDB;

-- 6. INVENTORY ITEMS (CENTRAL STOCK)
CREATE TABLE inventory_items (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  sku VARCHAR(50) NOT NULL UNIQUE,
  category ENUM('Kitchen Raw', 'Beverage', 'Housekeeping', 'Maintenance', 'Linen') NOT NULL,
  quantity_on_hand DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  unit_of_measure VARCHAR(20) NOT NULL,
  reorder_level DECIMAL(10,2) NOT NULL DEFAULT 10.00,
  unit_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_inv_category (category),
  INDEX idx_inv_reorder (quantity_on_hand, reorder_level)
) ENGINE=InnoDB;

-- 7. MENU ITEMS
CREATE TABLE menu_items (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  category ENUM('Food', 'Beverage', 'Alcohol', 'Dessert', 'Snack') NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  description TEXT,
  preparation_time_minutes INT NOT NULL DEFAULT 15,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_menu_category (category),
  INDEX idx_menu_active (is_active)
) ENGINE=InnoDB;

-- 8. RECIPES (BOM INVENTORY DEDUCTION)
CREATE TABLE recipes (
  id VARCHAR(36) PRIMARY KEY,
  menu_item_id VARCHAR(36) NOT NULL,
  inventory_item_id VARCHAR(36) NOT NULL,
  quantity_required DECIMAL(10,3) NOT NULL,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
  FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- 9. ORDERS (F&B / BISTRO)
CREATE TABLE orders (
  id VARCHAR(36) PRIMARY KEY,
  order_number VARCHAR(20) NOT NULL UNIQUE,
  order_type ENUM('Table', 'RoomService') NOT NULL,
  table_number VARCHAR(10),
  room_id VARCHAR(36),
  waiter_id VARCHAR(36) NOT NULL,
  status ENUM('Pending', 'Confirmed', 'Preparing', 'Ready', 'Served', 'Completed', 'Cancelled') NOT NULL DEFAULT 'Pending',
  payment_status ENUM('Unpaid', 'Paid', 'ChargedToRoom', 'Refunded') NOT NULL DEFAULT 'Unpaid',
  subtotal_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL,
  FOREIGN KEY (waiter_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_orders_status (status),
  INDEX idx_orders_payment (payment_status)
) ENGINE=InnoDB;

-- 10. ORDER ITEMS
CREATE TABLE order_items (
  id VARCHAR(36) PRIMARY KEY,
  order_id VARCHAR(36) NOT NULL,
  menu_item_id VARCHAR(36) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  special_notes VARCHAR(255),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- 11. AUDIT LOGS
CREATE TABLE audit_logs (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36),
  action VARCHAR(50) NOT NULL,
  table_name VARCHAR(50) NOT NULL,
  record_id VARCHAR(36),
  notes TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_audit_table (table_name),
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB;`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(MYSQL_DDL);
    setCopied(true);
    success('MySQL DDL Script Copied to Clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const selectedTableObj = TABLES_SCHEMA.find((t) => t.name === selectedTable) || TABLES_SCHEMA[0];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">MySQL Relational Schema & DDL Engine</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Production-grade 3NF relational model, foreign key constraints, indexes & automated triggers.
            </p>
          </div>
        </div>

        <button
          onClick={copyToClipboard}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 flex items-center gap-2 transition-transform active:scale-95 self-start sm:self-auto"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copied DDL' : 'Export Full MySQL Script'}
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('tables')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 ${
            activeTab === 'tables'
              ? 'bg-amber-500 text-slate-950 shadow'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <Table className="w-3.5 h-3.5" />
          Table Catalog ({TABLES_SCHEMA.length})
        </button>

        <button
          onClick={() => setActiveTab('erd')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 ${
            activeTab === 'erd'
              ? 'bg-amber-500 text-slate-950 shadow'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Entity Relationships (ERD)
        </button>

        <button
          onClick={() => setActiveTab('ddl')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 ${
            activeTab === 'ddl'
              ? 'bg-amber-500 text-slate-950 shadow'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <FileCode className="w-3.5 h-3.5" />
          Raw MySQL DDL
        </button>
      </div>

      {/* TAB 1: TABLE CATALOG */}
      {activeTab === 'tables' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Table List */}
          <div className="lg:col-span-1 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">Database Tables</h3>
            <div className="space-y-1">
              {TABLES_SCHEMA.map((t) => {
                const isSel = selectedTable === t.name;
                return (
                  <button
                    key={t.name}
                    onClick={() => setSelectedTable(t.name)}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold text-left transition-all ${
                      isSel
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                        : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Table className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-mono">{t.name}</span>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                      {t.columns.length} cols
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Table Details */}
          <div className="lg:col-span-3 space-y-4">
            <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold font-mono text-amber-400">{selectedTableObj.name}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                      {selectedTableObj.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{selectedTableObj.description}</p>
                </div>
              </div>

              {/* Columns Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold font-mono">
                    <tr>
                      <th className="p-3">Column Name</th>
                      <th className="p-3">Data Type</th>
                      <th className="p-3">Constraint / Key</th>
                      <th className="p-3">Nullable</th>
                      <th className="p-3">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-slate-300">
                    {selectedTableObj.columns.map((c) => (
                      <tr key={c.name} className="hover:bg-slate-800/50 transition-colors">
                        <td className="p-3 font-mono font-bold text-white">{c.name}</td>
                        <td className="p-3 font-mono text-amber-300 text-[11px]">{c.type}</td>
                        <td className="p-3">
                          {c.key === 'PK' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              PRIMARY KEY
                            </span>
                          ) : c.key === 'FK' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                              FOREIGN KEY
                            </span>
                          ) : c.key === 'UNI' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              UNIQUE
                            </span>
                          ) : c.key === 'IDX' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              INDEXED
                            </span>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </td>
                        <td className="p-3 font-mono text-xs">{c.nullable}</td>
                        <td className="p-3 text-slate-300">{c.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ERD RELATIONSHIPS */}
      {activeTab === 'erd' && (
        <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-6">
          <div>
            <h3 className="text-sm font-bold text-white">Relational Foreign Key Map & Integrity Rules</h3>
            <p className="text-xs text-slate-400 mt-1">
              Referential actions ensure cascade deletions on line items while enforcing strict RESTRICT constraints on core records.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                source: 'reservations',
                target: 'guests',
                fk: 'guest_id ➔ guests.id',
                type: 'Many-to-One (N:1)',
                rule: 'ON DELETE RESTRICT',
                desc: 'Prevents guest profile deletion if reservations exist.',
              },
              {
                source: 'reservations',
                target: 'rooms',
                fk: 'room_id ➔ rooms.id',
                type: 'Many-to-One (N:1)',
                rule: 'ON DELETE RESTRICT',
                desc: 'Protects physical room mapping from orphaned schedules.',
              },
              {
                source: 'rooms',
                target: 'room_types',
                fk: 'room_type_id ➔ room_types.id',
                type: 'Many-to-One (N:1)',
                rule: 'ON DELETE RESTRICT',
                desc: 'Standardized rate tier binding.',
              },
              {
                source: 'order_items',
                target: 'orders',
                fk: 'order_id ➔ orders.id',
                type: 'Many-to-One (N:1)',
                rule: 'ON DELETE CASCADE',
                desc: 'Deleting an order ticket automatically cascades to line items.',
              },
              {
                source: 'order_items',
                target: 'menu_items',
                fk: 'menu_item_id ➔ menu_items.id',
                type: 'Many-to-One (N:1)',
                rule: 'ON DELETE RESTRICT',
                desc: 'Historical order audits cannot reference deleted dishes.',
              },
              {
                source: 'recipes',
                target: 'inventory_items',
                fk: 'inventory_item_id ➔ inventory_items.id',
                type: 'Many-to-One (N:1)',
                rule: 'ON DELETE RESTRICT',
                desc: 'BOM deduction engine requires valid raw ingredient stock IDs.',
              },
            ].map((rel, i) => (
              <div
                key={i}
                className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-amber-400">
                    {rel.source} <span className="text-slate-500">➔</span> {rel.target}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300">
                    {rel.type}
                  </span>
                </div>
                <div className="text-xs space-y-1">
                  <p className="font-mono text-slate-300 font-semibold">{rel.fk}</p>
                  <p className="text-slate-400 text-[11px]">{rel.desc}</p>
                  <span className="inline-block px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-emerald-400">
                    {rel.rule}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: DDL SQL SCRIPT */}
      {activeTab === 'ddl' && (
        <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400">schema_definition.sql (MySQL 8.0+ Compatible)</span>
            <button
              onClick={copyToClipboard}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" /> Copy SQL
            </button>
          </div>

          <pre className="p-4 rounded-xl bg-slate-900 text-slate-300 font-mono text-xs overflow-x-auto leading-relaxed border border-slate-800">
            {MYSQL_DDL}
          </pre>
        </div>
      )}
    </div>
  );
};
