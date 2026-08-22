export type UserRole = 'admin' | 'manager' | 'chef' | 'housekeeper' | 'waiter';

export interface User {
  id: string;
  username: string;
  email: string;
  full_name: string;
  phone?: string;
  role: UserRole;
  role_id: string;
  role_display_name: string;
  is_active?: number;
  avatar_url?: string;
  created_at?: string;
}

export type RoomStatus =
  | 'Available'
  | 'Reserved'
  | 'Occupied'
  | 'Dirty'
  | 'Cleaning'
  | 'Clean'
  | 'Maintenance'
  | 'Out of Service';

export interface RoomType {
  id: string;
  name: string;
  code: string;
  base_price: number;
  capacity: number;
  description?: string;
  amenities?: string;
}

export interface Room {
  id: string;
  room_number: string;
  floor: number;
  room_type_id: string;
  room_type_name?: string;
  room_type_code?: string;
  capacity?: number;
  amenities?: string;
  status: RoomStatus;
  current_occupant_id?: string | null;
  occupant_name?: string | null;
  occupant_phone?: string | null;
  occupant_code?: string | null;
  price_per_night: number;
  notes?: string | null;
  last_cleaned_at?: string | null;
}

export interface Guest {
  id: string;
  guest_code: string;
  full_name: string;
  phone: string;
  email?: string | null;
  id_type?: string;
  id_number?: string | null;
  nationality?: string;
  address?: string | null;
  notes?: string | null;
  total_stays?: number;
  last_stay_date?: string | null;
  created_at?: string;
}

export interface Reservation {
  id: string;
  reservation_number: string;
  guest_id: string;
  guest_name?: string;
  guest_phone?: string;
  guest_email?: string;
  room_id: string;
  room_number?: string;
  room_type_name?: string;
  check_in_date: string;
  check_out_date: string;
  num_guests: number;
  total_amount: number;
  deposit_amount: number;
  status: 'Confirmed' | 'CheckedIn' | 'CheckedOut' | 'Cancelled' | 'NoShow';
  special_requests?: string | null;
  created_at?: string;
}

export interface CheckIn {
  id: string;
  check_in_number: string;
  reservation_id?: string | null;
  guest_id: string;
  guest_name?: string;
  room_id: string;
  room_number?: string;
  check_in_time: string;
  expected_check_out_date: string;
  actual_check_out_time?: string | null;
  deposit_paid: number;
  payment_method: string;
  status: 'Active' | 'Completed';
  notes?: string | null;
}

export interface InventoryCategory {
  id: string;
  name: string;
  description?: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  category?: string;
  is_active?: number;
}

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  category_id: string;
  category_name?: string;
  department?: string;
  unit: string;
  current_quantity: number;
  reserved_quantity: number;
  available_quantity?: number;
  minimum_quantity: number;
  reorder_quantity: number;
  unit_cost: number;
  supplier_id?: string | null;
  supplier_name?: string | null;
  storage_location?: string | null;
  stock_status?: 'In Stock' | 'Low Stock' | 'Critical Stock' | 'Out of Stock';
  recommended_reorder?: number;
  is_active: number;
}

export interface InventoryTransaction {
  id: string;
  item_id: string;
  item_name?: string;
  sku?: string;
  unit?: string;
  transaction_type: 'Received' | 'Issued' | 'Consumed' | 'Returned' | 'Damaged' | 'Lost' | 'Expired' | 'Adjustment';
  quantity: number;
  previous_quantity: number;
  new_quantity: number;
  unit_cost?: number;
  total_cost?: number;
  reference_id?: string | null;
  reason: string;
  user_id: string;
  user_name?: string;
  username?: string;
  created_at: string;
}

export interface StockRequestItem {
  id: string;
  request_id: string;
  item_id: string;
  item_name?: string;
  sku?: string;
  quantity_requested: number;
  quantity_approved: number;
  unit?: string;
  current_quantity?: number;
}

export interface StockRequest {
  id: string;
  request_number: string;
  department: 'Kitchen' | 'Bar' | 'Housekeeping';
  requested_by: string;
  requester_name?: string;
  requester_username?: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Fulfilled';
  priority: 'Low' | 'Normal' | 'Urgent';
  reason?: string | null;
  reviewed_by?: string | null;
  reviewer_name?: string | null;
  review_notes?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  items?: StockRequestItem[];
}

export interface MenuCategory {
  id: string;
  name: string;
  display_order: number;
  icon?: string;
}

export interface MenuItemIngredient {
  id: string;
  menu_item_id: string;
  inventory_item_id: string;
  inventory_name?: string;
  sku?: string;
  quantity_required: number;
  unit: string;
  inventory_unit?: string;
  current_quantity?: number;
  reserved_quantity?: number;
  available_stock?: number;
}

export interface MenuItem {
  id: string;
  name: string;
  category_id: string;
  category_name?: string;
  category_icon?: string;
  description?: string | null;
  price: number;
  preparation_duration: number;
  is_active: number;
  is_available: number;
  deactivation_reason?: string | null;
  deactivated_by_name?: string | null;
  image_url?: string | null;
  available_servings?: number;
  can_order?: boolean;
  stock_status?: 'AVAILABLE' | 'LOW STOCK' | 'OUT OF STOCK';
  missing_ingredients?: string[];
  effective_reason?: string | null;
  ingredients?: MenuItemIngredient[];
}

export type OrderStatus =
  | 'Pending'
  | 'Confirmed'
  | 'Preparing'
  | 'Ready'
  | 'Served'
  | 'Completed'
  | 'Cancelled';

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  menu_item_name: string;
  unit_price: number;
  quantity: number;
  total_price: number;
  special_notes?: string | null;
  category_name?: string;
}

export interface Order {
  id: string;
  order_number: string;
  order_type: 'Table' | 'Room Service' | 'Bar Takeaway';
  table_number?: string | null;
  room_id?: string | null;
  room_number?: string | null;
  guest_id?: string | null;
  guest_name?: string | null;
  waiter_id: string;
  waiter_name?: string;
  status: OrderStatus;
  payment_status: 'Unpaid' | 'Paid' | 'ChargedToRoom' | 'Complimentary';
  subtotal: number;
  discount: number;
  tax: number;
  total_amount: number;
  notes?: string | null;
  stock_reserved: number;
  stock_consumed: number;
  created_at: string;
  items?: OrderItem[];
}

export interface KitchenWaste {
  id: string;
  inventory_item_id: string;
  item_name?: string;
  sku?: string;
  quantity: number;
  unit: string;
  cost_loss: number;
  reason: string;
  notes?: string | null;
  reported_by: string;
  reported_by_name?: string;
  date_reported: string;
}

export interface KitchenUsage {
  id: string;
  inventory_item_id: string;
  item_name?: string;
  quantity: number;
  unit: string;
  used_for: string;
  recorded_by: string;
  user_name?: string;
  date_recorded: string;
}

export interface MaintenanceRequest {
  id: string;
  ticket_number: string;
  room_id?: string | null;
  room_number?: string | null;
  location?: string | null;
  issue_type: string;
  description: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  status: 'Reported' | 'In Progress' | 'Resolved' | 'Closed';
  reported_by: string;
  reporter_name?: string;
  assigned_to?: string | null;
  resolved_at?: string | null;
  resolution_notes?: string | null;
  created_at: string;
}

export interface StaffShift {
  id: string;
  user_id: string;
  user_name?: string;
  username?: string;
  role?: string;
  role_name?: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  shift_type: 'Morning' | 'Afternoon' | 'Night' | 'Full Day';
  department: string;
  notes?: string | null;
}

export interface ShiftSwapRequest {
  id: string;
  requesting_user_id: string;
  requester_name?: string;
  target_user_id: string;
  target_name?: string;
  shift_id: string;
  target_shift_id?: string | null;
  req_shift_date?: string;
  req_shift_start?: string;
  req_shift_end?: string;
  req_dept?: string;
  tgt_shift_date?: string;
  tgt_shift_start?: string;
  tgt_shift_end?: string;
  reason: string;
  target_status: 'Pending' | 'Accepted' | 'Declined';
  manager_status: 'Pending' | 'Approved' | 'Rejected';
  approved_by?: string | null;
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  user_id: string;
  user_name?: string;
  username?: string;
  role_name?: string;
  date: string;
  clock_in: string;
  clock_out?: string | null;
  break_duration_minutes: number;
  total_hours: number;
  status: 'Present' | 'Late' | 'Half Day' | 'Overtime';
  notes?: string | null;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  item_type: 'Room' | 'Food' | 'Drinks' | 'Food/Drinks' | 'Service' | 'Other';
  unit_price: number;
  quantity: number;
  total_price: number;
}

export interface Payment {
  id: string;
  receipt_number: string;
  invoice_id?: string | null;
  order_id?: string | null;
  guest_id?: string | null;
  guest_name?: string | null;
  invoice_number?: string | null;
  order_number?: string | null;
  amount: number;
  payment_method: 'Cash' | 'Credit Card' | 'Mobile Money' | 'Bank Transfer';
  payment_category: 'Room' | 'Food' | 'Drinks' | 'Deposit' | 'Food/Drinks' | 'Other';
  reference_number?: string | null;
  received_by: string;
  receiver_name?: string;
  payment_date: string;
  notes?: string | null;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  guest_id: string;
  guest_name?: string;
  guest_phone?: string;
  check_in_id?: string | null;
  room_id?: string | null;
  room_number?: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  status: 'Unpaid' | 'Partially Paid' | 'Paid' | 'Cancelled';
  due_date?: string | null;
  created_at: string;
  items?: InvoiceItem[];
  payments?: Payment[];
}

export interface Expense {
  id: string;
  expense_number: string;
  category: string;
  title: string;
  amount: number;
  payment_method: string;
  supplier_id?: string | null;
  supplier_name?: string | null;
  paid_to?: string | null;
  expense_date: string;
  receipt_reference?: string | null;
  recorded_by: string;
  recorder_name?: string;
  notes?: string | null;
}

export interface AuditLog {
  id: string;
  user_id?: string;
  username: string;
  role: string;
  module: string;
  action: string;
  record_id?: string | null;
  details: string;
  ip_address?: string;
  created_at: string;
}

export interface AppNotification {
  id: string;
  type: 'low_stock' | 'new_order' | 'order_status' | 'check_in' | 'maintenance' | 'request' | 'menu_unavailable';
  title: string;
  message: string;
  target_role?: string;
  target_user_id?: string | null;
  is_read: number;
  link?: string | null;
  created_at: string;
}
