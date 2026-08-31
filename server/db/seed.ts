import bcrypt from 'bcryptjs';
import { dbAll, dbGet, dbRun, dbTransaction } from './database';

export async function seedDatabaseIfEmpty(): Promise<void> {
  const usersCount = await dbGet<{ count: number }>('SELECT COUNT(*) as count FROM users');
  if (usersCount && usersCount.count > 0) {
    console.log('Database already seeded. Skipping initial seed.');
    return;
  }

  console.log('Seeding fresh motel management relational database...');

  const salt = bcrypt.genSaltSync(10);
  const adminPass = bcrypt.hashSync('admin123', salt);
  const managerPass = bcrypt.hashSync('manager123', salt);
  const chefPass = bcrypt.hashSync('chef123', salt);
  const housePass = bcrypt.hashSync('housekeeper123', salt);
  const bartenderPass = bcrypt.hashSync('bartender123', salt);

  await dbTransaction(async () => {
    // 1. Roles
    const roles = [
      { id: 'role-admin', name: 'admin', display_name: 'Administrator', description: 'Full system control, users, settings, and logs' },
      { id: 'role-manager', name: 'manager', display_name: 'Manager', description: 'Daily motel operations, front-desk, pricing, inventory approval, finance' },
      { id: 'role-chef', name: 'chef', display_name: 'Kitchen Chef', description: 'Food preparation, kitchen inventory, recipe availability controls' },
      { id: 'role-housekeeper', name: 'housekeeper', display_name: 'Housekeeper', description: 'Room cleaning, linen/cleaning supplies requests, damage reporting' },
      { id: 'role-bartender', name: 'bartender', display_name: 'Bartender', description: 'Bar operations, drink service, table/room service, order management' },
    ];

    for (const r of roles) {
      await dbRun('INSERT IGNORE INTO roles (id, name, display_name, description) VALUES (?, ?, ?, ?)', [
        r.id, r.name, r.display_name, r.description
      ]);
    }

    // 2. Users
    const users = [
      { id: 'usr-admin', username: 'admin', email: 'admin@motel.com', pass: adminPass, name: 'Arthur Vance', role_id: 'role-admin', phone: '+250 788 111 222' },
      { id: 'usr-manager', username: 'manager', email: 'manager@motel.com', pass: managerPass, name: 'Claire Bennett', role_id: 'role-manager', phone: '+250 788 222 333' },
      { id: 'usr-chef', username: 'chef', email: 'chef@motel.com', pass: chefPass, name: 'Chef Jean Luc', role_id: 'role-chef', phone: '+250 788 333 444' },
      { id: 'usr-housekeeper', username: 'housekeeper', email: 'housekeeper@motel.com', pass: housePass, name: 'Marie Mutoni', role_id: 'role-housekeeper', phone: '+250 788 444 555' },
      { id: 'usr-bartender', username: 'bartender', email: 'bartender@motel.com', pass: bartenderPass, name: 'Patrick Habineza', role_id: 'role-bartender', phone: '+250 788 555 666' },
    ];

    for (const u of users) {
      await dbRun('INSERT IGNORE INTO users (id, username, email, password_hash, full_name, role_id, phone, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)', [
        u.id, u.username, u.email, u.pass, u.name, u.role_id, u.phone
      ]);
    }

    // 3. Room Types
    const roomTypes = [
      { id: 'rt-single', name: 'Standard Single', code: 'STD-SGL', base_price: 35000, capacity: 1, description: 'Cozy single room with high-speed WiFi, private bath, working desk.', amenities: 'WiFi, Shower, Work Desk, Air Conditioning, TV' },
      { id: 'rt-double', name: 'Standard Double', code: 'STD-DBL', base_price: 55000, capacity: 2, description: 'Spacious queen room with city views, ensuite bathroom, mini fridge.', amenities: 'WiFi, Queen Bed, Mini Fridge, TV, Coffee Maker, Balcony' },
      { id: 'rt-deluxe', name: 'Deluxe Suite', code: 'DLX-STE', base_price: 85000, capacity: 3, description: 'Luxury king suite with sofa lounge, luxury bath, complimentary bar snacks.', amenities: 'WiFi, King Bed, Lounge Area, Bathtub, Smart TV, Mini Bar, Safe' },
      { id: 'rt-family', name: 'Executive Family Suite', code: 'FAM-STE', base_price: 130000, capacity: 4, description: 'Two interconnected bedrooms, kitchenette, dining table, panoramic terrace.', amenities: 'WiFi, 2 King Beds, Kitchenette, Dining Table, 2 Bathrooms, Terrace' },
    ];

    for (const rt of roomTypes) {
      await dbRun('INSERT IGNORE INTO room_types (id, name, code, base_price, capacity, description, amenities) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        rt.id, rt.name, rt.code, rt.base_price, rt.capacity, rt.description, rt.amenities
      ]);
    }

    // 4. Guests
    const guests = [
      { id: 'gst-001', code: 'GST-2026-001', name: 'John Smith', phone: '+1 415 555 0192', email: 'john.smith@gmail.com', id_type: 'Passport', id_number: 'USA-9823412', nationality: 'American', address: 'San Francisco, CA' },
      { id: 'gst-002', code: 'GST-2026-002', name: 'Alice Uwase', phone: '+250 788 901 234', email: 'alice.uwase@gmail.com', id_type: 'National ID', id_number: '1199480029381029', nationality: 'Rwandan', address: 'Kigali, Nyarugenge' },
      { id: 'gst-003', code: 'GST-2026-003', name: 'David Mugisha', phone: '+250 788 456 789', email: 'david.mugisha@gmail.com', id_type: 'National ID', id_number: '1198880019283921', nationality: 'Rwandan', address: 'Kigali, Kacyiru' },
      { id: 'gst-004', code: 'GST-2026-004', name: 'Sarah Johnson', phone: '+44 20 7946 0912', email: 'sarah.j@travel.co.uk', id_type: 'Passport', id_number: 'GBR-7821903', nationality: 'British', address: 'London, UK' },
      { id: 'gst-005', code: 'GST-2026-005', name: 'Jean-Paul Habimana', phone: '+250 788 777 888', email: 'jp.habimana@tech.rw', id_type: 'National ID', id_number: '1199180039281726', nationality: 'Rwandan', address: 'Huye, Southern Province' },
    ];

    for (const g of guests) {
      await dbRun('INSERT IGNORE INTO guests (id, guest_code, full_name, phone, email, id_type, id_number, nationality, address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        g.id, g.code, g.name, g.phone, g.email, g.id_type, g.id_number, g.nationality, g.address
      ]);
    }

    // 5. Rooms (12 Rooms with realistic diverse statuses)
    const rooms = [
      { id: 'rm-101', number: '101', floor: 1, type_id: 'rt-single', status: 'Available', occupant: null, price: 35000, notes: 'Quiet corner room' },
      { id: 'rm-102', number: '102', floor: 1, type_id: 'rt-double', status: 'Occupied', occupant: 'gst-001', price: 55000, notes: 'Guest requested extra towels' },
      { id: 'rm-103', number: '103', floor: 1, type_id: 'rt-double', status: 'Dirty', occupant: null, price: 55000, notes: 'Checked out at 09:00, needs full turnover' },
      { id: 'rm-104', number: '104', floor: 1, type_id: 'rt-single', status: 'Cleaning', occupant: null, price: 35000, notes: 'Housekeeper Marie in progress' },
      { id: 'rm-201', number: '201', floor: 2, type_id: 'rt-deluxe', status: 'Reserved', occupant: null, price: 85000, notes: 'Arrival expected at 14:00' },
      { id: 'rm-202', number: '202', floor: 2, type_id: 'rt-deluxe', status: 'Available', occupant: null, price: 85000, notes: 'Inspected and pristine' },
      { id: 'rm-203', number: '203', floor: 2, type_id: 'rt-deluxe', status: 'Occupied', occupant: 'gst-002', price: 85000, notes: 'Corporate guest, 3 night stay' },
      { id: 'rm-204', number: '204', floor: 2, type_id: 'rt-deluxe', status: 'Maintenance', occupant: null, price: 85000, notes: 'Air conditioning refrigerant servicing' },
      { id: 'rm-301', number: '301', floor: 3, type_id: 'rt-family', status: 'Available', occupant: null, price: 130000, notes: 'Executive panoramic suite' },
      { id: 'rm-302', number: '302', floor: 3, type_id: 'rt-family', status: 'Occupied', occupant: 'gst-003', price: 130000, notes: 'Family with 2 children' },
      { id: 'rm-303', number: '303', floor: 3, type_id: 'rt-family', status: 'Clean', occupant: null, price: 130000, notes: 'Cleaned, pending final manager release' },
      { id: 'rm-304', number: '304', floor: 3, type_id: 'rt-single', status: 'Available', occupant: null, price: 35000, notes: 'Standard room' },
    ];

    for (const rm of rooms) {
      await dbRun('INSERT IGNORE INTO rooms (id, room_number, floor, room_type_id, status, current_occupant_id, price_per_night, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
        rm.id, rm.number, rm.floor, rm.type_id, rm.status, rm.occupant, rm.price, rm.notes
      ]);
    }

    // 6. Active Reservations & Check-Ins
    const reservations = [
      { id: 'res-101', number: 'RES-2026-001', guest_id: 'gst-001', room_id: 'rm-102', in_date: '2026-08-14', out_date: '2026-08-17', total: 165000, deposit: 55000, status: 'CheckedIn' },
      { id: 'res-102', number: 'RES-2026-002', guest_id: 'gst-002', room_id: 'rm-203', in_date: '2026-08-13', out_date: '2026-08-16', total: 255000, deposit: 100000, status: 'CheckedIn' },
      { id: 'res-103', number: 'RES-2026-003', guest_id: 'gst-003', room_id: 'rm-302', in_date: '2026-08-14', out_date: '2026-08-18', total: 520000, deposit: 200000, status: 'CheckedIn' },
      { id: 'res-104', number: 'RES-2026-004', guest_id: 'gst-004', room_id: 'rm-201', in_date: '2026-08-15', out_date: '2026-08-19', total: 340000, deposit: 85000, status: 'Confirmed' },
    ];

    for (const res of reservations) {
      await dbRun('INSERT IGNORE INTO reservations (id, reservation_number, guest_id, room_id, check_in_date, check_out_date, total_amount, deposit_amount, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        res.id, res.number, res.guest_id, res.room_id, res.in_date, res.out_date, res.total, res.deposit, res.status, 'usr-manager'
      ]);
    }

    // Active Check-Ins
    const checkIns = [
      { id: 'chk-001', number: 'CHK-2026-001', res_id: 'res-101', guest_id: 'gst-001', room_id: 'rm-102', in_time: '2026-08-14 11:30:00', exp_out: '2026-08-17', deposit: 55000, by: 'usr-manager' },
      { id: 'chk-002', number: 'CHK-2026-002', res_id: 'res-102', guest_id: 'gst-002', room_id: 'rm-203', in_time: '2026-08-13 14:15:00', exp_out: '2026-08-16', deposit: 100000, by: 'usr-manager' },
      { id: 'chk-003', number: 'CHK-2026-003', res_id: 'res-103', guest_id: 'gst-003', room_id: 'rm-302', in_time: '2026-08-14 10:00:00', exp_out: '2026-08-18', deposit: 200000, by: 'usr-manager' },
    ];

    for (const c of checkIns) {
      await dbRun('INSERT IGNORE INTO check_ins (id, check_in_number, reservation_id, guest_id, room_id, check_in_time, expected_check_out_date, deposit_paid, checked_in_by, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, "Active")', [
        c.id, c.number, c.res_id, c.guest_id, c.room_id, c.in_time, c.exp_out, c.deposit, c.by
      ]);
    }

    // 7. Inventory Categories - Canonical live stock categories: Drink, Kitchen ingredient, Tools
    // (Food/Others/Linen/Ingredient retired; legacy rows kept below for FK safety only)
    const invCategories = [
      { id: 'cat-drink', name: 'Drink', description: 'Drink stock: beverages, juices, water, beer, wine, spirits (Stock Category: Drink)' },
      { id: 'cat-kitchen-ingredient', name: 'Kitchen ingredient', description: 'Kitchen ingredients: meats, poultry, dairy, produce, grains, spices, oils, prepared foods (Stock Category: Kitchen ingredient)' },
      { id: 'cat-tools-stock', name: 'Tools', description: 'Tools stock: cleaning supplies, amenities, maintenance spares (Stock Category: Tools)' },
      { id: 'cat-bar-stock', name: 'Bar', description: 'Bar stock (legacy -> Drink)' },
      { id: 'cat-kitchen-ing', name: 'Kitchen Ingredients', description: 'Kitchen Ingredients legacy -> Kitchen ingredient' },
      { id: 'cat-drinks', name: 'Drinks', description: 'Beverages legacy -> Drink' },
      { id: 'cat-foods', name: 'Foods', description: 'Prepared foods legacy -> Food' },
      { id: 'cat-tools', name: 'Tools', description: 'Cleaning supplies legacy -> Tools' },
      { id: 'cat-clean', name: 'Cleaning Supplies', description: 'Detergents, disinfectants, mops, sanitizers, amenities' },
      { id: 'cat-kitchen', name: 'Kitchen Ingredients', description: 'Fresh meats, poultry, dairy, produce, grains, spices, oils' },
      { id: 'cat-bar', name: 'Bar/Drinks', description: 'Juices, bottled water, sodas, beer, wine, spirits' },
    ];

    for (const ic of invCategories) {
      await dbRun('INSERT IGNORE INTO inventory_categories (id, name, description) VALUES (?, ?, ?)', [
        ic.id, ic.name, ic.description
      ]);
    }

    // 8. Suppliers
    const suppliers = [
      { id: 'sup-001', name: 'Fresh Valley Farm Supplies', contact: 'Patrick Karangwa', phone: '+250 788 123 456', email: 'orders@freshvalley.rw', category: 'Kitchen Ingredients' },
      { id: 'sup-002', name: 'Kigali Beverages Ltd', contact: 'Brenda Mukamana', phone: '+250 788 234 567', email: 'sales@kigalibev.rw', category: 'Bar/Drinks' },
      { id: 'sup-003', name: 'CleanPro Hygiene Solutions', contact: 'Eric Ntwari', phone: '+250 788 345 678', email: 'info@cleanpro.rw', category: 'Cleaning Supplies' },
      { id: 'sup-004', name: 'Royal Textiles & Linen', contact: 'Sonia Gasana', phone: '+250 788 456 789', email: 'orders@royaltextiles.rw', category: 'Linen' },
    ];

    for (const sup of suppliers) {
      await dbRun('INSERT IGNORE INTO suppliers (id, name, contact_person, phone, email, category) VALUES (?, ?, ?, ?, ?, ?)', [
        sup.id, sup.name, sup.contact, sup.phone, sup.email, sup.category
      ]);
    }

    // 9. Inventory Items
    const inventoryItems = [
      // Kitchen
      { id: 'inv-chicken', sku: 'ING-CHK-01', name: 'Fresh Chicken Breast', cat_id: 'cat-kitchen', department: 'Kitchen', unit: 'portions', qty: 15.0, res_qty: 0, min_qty: 6.0, reorder_qty: 25.0, cost: 3500, sup: 'sup-001', loc: 'Cold Storage Freezer 1' },
      { id: 'inv-potato', sku: 'ING-POT-01', name: 'Irish Potatoes (Peeled/Prepped)', cat_id: 'cat-kitchen', department: 'Kitchen', unit: 'kg', qty: 35.0, res_qty: 0, min_qty: 10.0, reorder_qty: 50.0, cost: 800, sup: 'sup-001', loc: 'Dry Pantry Bin 3' },
      { id: 'inv-oil', sku: 'ING-OIL-01', name: 'Pure Sunflower Cooking Oil', cat_id: 'cat-kitchen', department: 'Kitchen', unit: 'liters', qty: 20.0, res_qty: 0, min_qty: 5.0, reorder_qty: 25.0, cost: 2200, sup: 'sup-001', loc: 'Pantry Shelf A' },
      { id: 'inv-beef', sku: 'ING-BEEF-01', name: 'Prime Beef Steak Portions', cat_id: 'cat-kitchen', department: 'Kitchen', unit: 'portions', qty: 12.0, res_qty: 0, min_qty: 5.0, reorder_qty: 20.0, cost: 5000, sup: 'sup-001', loc: 'Cold Storage Freezer 2' },
      { id: 'inv-rice', sku: 'ING-RIC-01', name: 'Basmati Long Grain Rice', cat_id: 'cat-kitchen', department: 'Kitchen', unit: 'kg', qty: 25.0, res_qty: 0, min_qty: 8.0, reorder_qty: 30.0, cost: 1500, sup: 'sup-001', loc: 'Dry Pantry Bin 1' },
      { id: 'inv-pasta', sku: 'ING-PAS-01', name: 'Spaghetti Pasta', cat_id: 'cat-kitchen', department: 'Kitchen', unit: 'boxes', qty: 18.0, res_qty: 0, min_qty: 6.0, reorder_qty: 24.0, cost: 1200, sup: 'sup-001', loc: 'Dry Pantry Shelf B' },
      { id: 'inv-tomato', sku: 'ING-TOM-01', name: 'Fresh Italian Tomatoes & Herb Sauce', cat_id: 'cat-kitchen', department: 'Kitchen', unit: 'kg', qty: 15.0, res_qty: 0, min_qty: 5.0, reorder_qty: 20.0, cost: 1400, sup: 'sup-001', loc: 'Chilled Prep Station' },
      { id: 'inv-cheese', sku: 'ING-CHS-01', name: 'Shredded Mozzarella & Parmesan', cat_id: 'cat-kitchen', department: 'Kitchen', unit: 'kg', qty: 7.0, res_qty: 0, min_qty: 3.0, reorder_qty: 10.0, cost: 4500, sup: 'sup-001', loc: 'Dairy Chiller' },
      { id: 'inv-coffee', sku: 'ING-COF-01', name: 'Premium Ground Arabica Coffee', cat_id: 'cat-kitchen', department: 'Kitchen', unit: 'kg', qty: 6.0, res_qty: 0, min_qty: 2.0, reorder_qty: 8.0, cost: 8000, sup: 'sup-001', loc: 'Barista Counter' },
      { id: 'inv-milk', sku: 'ING-MLK-01', name: 'Fresh Whole Milk', cat_id: 'cat-kitchen', department: 'Kitchen', unit: 'liters', qty: 22.0, res_qty: 0, min_qty: 8.0, reorder_qty: 30.0, cost: 1100, sup: 'sup-001', loc: 'Dairy Chiller' },
      { id: 'inv-sugar', sku: 'ING-SUG-01', name: 'White Granulated Sugar', cat_id: 'cat-kitchen', department: 'Kitchen', unit: 'kg', qty: 25.0, res_qty: 0, min_qty: 5.0, reorder_qty: 20.0, cost: 1000, sup: 'sup-001', loc: 'Pantry Shelf A' },
      { id: 'inv-fish', sku: 'ING-FSH-01', name: 'Fresh Lake Tilapia Fillet', cat_id: 'cat-kitchen', department: 'Kitchen', unit: 'portions', qty: 0.0, res_qty: 0, min_qty: 5.0, reorder_qty: 15.0, cost: 4000, sup: 'sup-001', loc: 'Freezer 3' },

      // Bar & Drinks
      { id: 'inv-water', sku: 'DRK-WAT-01', name: 'Mineral Water 500ml Bottle', cat_id: 'cat-bar', department: 'Bar', unit: 'bottles', qty: 52.0, res_qty: 0, min_qty: 20.0, reorder_qty: 100.0, cost: 400, sup: 'sup-002', loc: 'Main Bar Under-Counter' },
      { id: 'inv-juice', sku: 'DRK-JUC-01', name: 'Fresh Squeezed Orange Juice', cat_id: 'cat-bar', department: 'Bar', unit: 'liters', qty: 4.0, res_qty: 0, min_qty: 6.0, reorder_qty: 15.0, cost: 1500, sup: 'sup-002', loc: 'Bar Chiller 1' },
      { id: 'inv-soda', sku: 'DRK-SOD-01', name: 'Sparkling Soda Assorted (330ml)', cat_id: 'cat-bar', department: 'Bar', unit: 'bottles', qty: 65.0, res_qty: 0, min_qty: 24.0, reorder_qty: 72.0, cost: 600, sup: 'sup-002', loc: 'Main Bar Chiller' },
      { id: 'inv-beer', sku: 'DRK-BER-01', name: 'Local Draught Beer 500ml', cat_id: 'cat-bar', department: 'Bar', unit: 'bottles', qty: 34.0, res_qty: 0, min_qty: 12.0, reorder_qty: 48.0, cost: 1200, sup: 'sup-002', loc: 'Bar Beer Cooler' },
      { id: 'inv-wine', sku: 'DRK-WIN-01', name: 'Cabernet Sauvignon Red Wine (750ml)', cat_id: 'cat-bar', department: 'Bar', unit: 'bottles', qty: 14.0, res_qty: 0, min_qty: 6.0, reorder_qty: 24.0, cost: 8000, sup: 'sup-002', loc: 'Wine Rack Cabinet' },

      // Housekeeping & Linen
      { id: 'inv-det-floor', sku: 'CLN-FLR-01', name: 'Pine Scented Floor Disinfectant', cat_id: 'cat-clean', department: 'Housekeeping', unit: 'liters', qty: 14.0, res_qty: 0, min_qty: 5.0, reorder_qty: 20.0, cost: 2500, sup: 'sup-003', loc: 'Housekeeping Storage 1' },
      { id: 'inv-det-bath', sku: 'CLN-BTH-01', name: 'Bathroom Sanitizer Spray', cat_id: 'cat-clean', department: 'Housekeeping', unit: 'bottles', qty: 11.0, res_qty: 0, min_qty: 4.0, reorder_qty: 16.0, cost: 2000, sup: 'sup-003', loc: 'Housekeeping Storage 1' },
      { id: 'inv-soap', sku: 'CLN-SOP-01', name: 'Guest Botanical Mini Soaps', cat_id: 'cat-clean', department: 'Housekeeping', unit: 'pieces', qty: 95.0, res_qty: 0, min_qty: 30.0, reorder_qty: 150.0, cost: 250, sup: 'sup-003', loc: 'Amenity Cupboard' },
      { id: 'inv-sheet-q', sku: 'LIN-SHT-01', name: 'Queen 400TC White Bed Sheet', cat_id: 'cat-linen', department: 'Housekeeping', unit: 'pieces', qty: 28.0, res_qty: 0, min_qty: 12.0, reorder_qty: 30.0, cost: 14000, sup: 'sup-004', loc: 'Linen Closet Floor 2' },
      { id: 'inv-towel-b', sku: 'LIN-TWL-01', name: 'Luxury Cotton Bath Towel', cat_id: 'cat-linen', department: 'Housekeeping', unit: 'pieces', qty: 36.0, res_qty: 0, min_qty: 15.0, reorder_qty: 40.0, cost: 8500, sup: 'sup-004', loc: 'Linen Closet Floor 2' },
    ];

    for (const item of inventoryItems) {
      await dbRun('INSERT IGNORE INTO inventory_items (id, sku, name, category_id, department, unit, current_quantity, reserved_quantity, minimum_quantity, reorder_quantity, unit_cost, supplier_id, storage_location) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        item.id, item.sku, item.name, item.cat_id, item.department, item.unit, item.qty, item.res_qty, item.min_qty, item.reorder_qty, item.cost, item.sup, item.loc
      ]);
    }

    // 10. Menu Categories
    const menuCategories = [
      { id: 'mcat-breakfast', name: 'Breakfast', display_order: 1, icon: 'Coffee' },
      { id: 'mcat-lunch', name: 'Lunch', display_order: 2, icon: 'Utensils' },
      { id: 'mcat-dinner', name: 'Dinner', display_order: 3, icon: 'Flame' },
      { id: 'mcat-drinks', name: 'Drinks & Bar', display_order: 4, icon: 'Wine' },
      { id: 'mcat-snacks', name: 'Snacks & Sides', display_order: 5, icon: 'Cookie' },
      { id: 'mcat-desserts', name: 'Desserts', display_order: 6, icon: 'Cake' },
    ];

    for (const mc of menuCategories) {
      await dbRun('INSERT IGNORE INTO menu_categories (id, name, display_order, icon) VALUES (?, ?, ?, ?)', [
        mc.id, mc.name, mc.display_order, mc.icon
      ]);
    }

    // 11. Menu Items
    const menuItems = [
      { id: 'menu-chk-chips', name: 'Golden Chicken & Chips', cat_id: 'mcat-lunch', desc: 'Crisp seasoned chicken breast served with hand-cut rustic French fries and house dip.', price: 12000, prep: 20, active: 1, avail: 1, reason: null },
      { id: 'menu-beef-rice', name: 'Char-Grilled Beef Steak & Rice', cat_id: 'mcat-dinner', desc: 'Tender prime beef steak with rosemary jus, served over fragrant basmati rice.', price: 15500, prep: 25, active: 1, avail: 1, reason: null },
      { id: 'menu-pasta-bol', name: 'Classic Spaghetti Bolognese', cat_id: 'mcat-dinner', desc: 'Authentic pasta tossed with rich slow-cooked beef tomato sauce and parmesan cheese.', price: 11000, prep: 18, active: 1, avail: 1, reason: null },
      { id: 'menu-cont-brk', name: 'Continental Motel Breakfast', cat_id: 'mcat-breakfast', desc: 'Freshly brewed arabica coffee, warm milk, toast, butter, seasonal fruit preserve.', price: 7500, prep: 12, active: 1, avail: 1, reason: null },
      { id: 'menu-coffee', name: 'Fresh Brewed Arabica Coffee', cat_id: 'mcat-drinks', desc: 'Aromatic single-origin Rwandan Arabica drip coffee served black or with steamed milk.', price: 2500, prep: 5, active: 1, avail: 1, reason: null },
      { id: 'menu-oj', name: 'Cold Fresh Orange Juice', cat_id: 'mcat-drinks', desc: 'Freshly squeezed sweet orange juice (300ml glass).', price: 3000, prep: 4, active: 1, avail: 1, reason: null },
      { id: 'menu-water', name: 'Natural Spring Mineral Water', cat_id: 'mcat-drinks', desc: 'Chilled 500ml pure spring mineral water.', price: 1500, prep: 2, active: 1, avail: 1, reason: null },
      { id: 'menu-beer', name: 'Chilled Craft Draught Beer', cat_id: 'mcat-drinks', desc: 'Refreshing local ice-cold lager (500ml bottle).', price: 3500, prep: 2, active: 1, avail: 1, reason: null },
      { id: 'menu-wine-glass', name: 'Cabernet Red Wine (Glass)', cat_id: 'mcat-drinks', desc: 'Full-bodied oak-aged Cabernet Sauvignon served by the glass (150ml).', price: 6000, prep: 3, active: 1, avail: 1, reason: null },
      { id: 'menu-fries', name: 'Crispy Rustic French Fries', cat_id: 'mcat-snacks', desc: 'Double-fried seasoned potato chips served with homemade garlic mayo.', price: 4000, prep: 10, active: 1, avail: 1, reason: null },
      { id: 'menu-fish-tilapia', name: 'Chef Special Grilled Tilapia', cat_id: 'mcat-dinner', desc: 'Fresh marinated lake tilapia fillet with lemon butter sauce.', price: 14000, prep: 25, active: 1, avail: 0, reason: 'Tilapia fillet out of stock from supplier' },
    ];

    for (const mi of menuItems) {
      await dbRun('INSERT IGNORE INTO menu_items (id, name, category_id, description, price, preparation_duration, is_active, is_available, deactivation_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        mi.id, mi.name, mi.cat_id, mi.desc, mi.price, mi.prep, mi.active, mi.avail, mi.reason
      ]);
    }

    // 12. Menu Item Ingredients (Recipe connections)
    const recipes = [
      // Chicken & Chips -> Chicken (1 portion), Potatoes (0.4 kg), Oil (0.1 L)
      { id: 'rec-1', menu_id: 'menu-chk-chips', inv_id: 'inv-chicken', qty: 1.0, unit: 'portions' },
      { id: 'rec-2', menu_id: 'menu-chk-chips', inv_id: 'inv-potato', qty: 0.4, unit: 'kg' },
      { id: 'rec-3', menu_id: 'menu-chk-chips', inv_id: 'inv-oil', qty: 0.1, unit: 'liters' },

      // Beef Steak & Rice -> Beef (1 portion), Rice (0.25 kg), Oil (0.05 L)
      { id: 'rec-4', menu_id: 'menu-beef-rice', inv_id: 'inv-beef', qty: 1.0, unit: 'portions' },
      { id: 'rec-5', menu_id: 'menu-beef-rice', inv_id: 'inv-rice', qty: 0.25, unit: 'kg' },
      { id: 'rec-6', menu_id: 'menu-beef-rice', inv_id: 'inv-oil', qty: 0.05, unit: 'liters' },

      // Spaghetti Bolognese -> Pasta (0.5 box), Beef (0.5 portion), Tomato (0.3 kg), Cheese (0.08 kg)
      { id: 'rec-7', menu_id: 'menu-pasta-bol', inv_id: 'inv-pasta', qty: 0.5, unit: 'boxes' },
      { id: 'rec-8', menu_id: 'menu-pasta-bol', inv_id: 'inv-beef', qty: 0.5, unit: 'portions' },
      { id: 'rec-9', menu_id: 'menu-pasta-bol', inv_id: 'inv-tomato', qty: 0.3, unit: 'kg' },
      { id: 'rec-10', menu_id: 'menu-pasta-bol', inv_id: 'inv-cheese', qty: 0.08, unit: 'kg' },

      // Continental Breakfast -> Coffee (0.03 kg), Milk (0.15 L), Sugar (0.02 kg)
      { id: 'rec-11', menu_id: 'menu-cont-brk', inv_id: 'inv-coffee', qty: 0.03, unit: 'kg' },
      { id: 'rec-12', menu_id: 'menu-cont-brk', inv_id: 'inv-milk', qty: 0.15, unit: 'liters' },
      { id: 'rec-13', menu_id: 'menu-cont-brk', inv_id: 'inv-sugar', qty: 0.02, unit: 'kg' },

      // Coffee -> Coffee (0.03 kg), Milk (0.1 L), Sugar (0.02 kg)
      { id: 'rec-14', menu_id: 'menu-coffee', inv_id: 'inv-coffee', qty: 0.03, unit: 'kg' },
      { id: 'rec-15', menu_id: 'menu-coffee', inv_id: 'inv-milk', qty: 0.1, unit: 'liters' },
      { id: 'rec-16', menu_id: 'menu-coffee', inv_id: 'inv-sugar', qty: 0.02, unit: 'kg' },

      // Orange Juice -> Orange Juice (0.3 L)
      { id: 'rec-17', menu_id: 'menu-oj', inv_id: 'inv-juice', qty: 0.3, unit: 'liters' },

      // Mineral Water -> 1 bottle
      { id: 'rec-18', menu_id: 'menu-water', inv_id: 'inv-water', qty: 1.0, unit: 'bottles' },

      // Beer -> 1 bottle
      { id: 'rec-19', menu_id: 'menu-beer', inv_id: 'inv-beer', qty: 1.0, unit: 'bottles' },

      // Wine Glass -> 0.2 bottle
      { id: 'rec-20', menu_id: 'menu-wine-glass', inv_id: 'inv-wine', qty: 0.2, unit: 'bottles' },

      // Fries -> Potatoes (0.4 kg), Oil (0.1 L)
      { id: 'rec-21', menu_id: 'menu-fries', inv_id: 'inv-potato', qty: 0.4, unit: 'kg' },
      { id: 'rec-22', menu_id: 'menu-fries', inv_id: 'inv-oil', qty: 0.1, unit: 'liters' },

      // Tilapia -> Fish (1 portion), Oil (0.05 L)
      { id: 'rec-23', menu_id: 'menu-fish-tilapia', inv_id: 'inv-fish', qty: 1.0, unit: 'portions' },
      { id: 'rec-24', menu_id: 'menu-fish-tilapia', inv_id: 'inv-oil', qty: 0.05, unit: 'liters' },
    ];

    for (const r of recipes) {
      await dbRun('INSERT IGNORE INTO menu_item_ingredients (id, menu_item_id, inventory_item_id, quantity_required, unit) VALUES (?, ?, ?, ?, ?)', [
        r.id, r.menu_id, r.inv_id, r.qty, r.unit
      ]);
    }

    // 13. Orders & Order Items
    const orders = [
      { id: 'ord-001', num: 'ORD-2026-001', type: 'Table', table: 'Table 4', room_id: null, guest_id: null, bartender: 'usr-bartender', status: 'Completed', pay_stat: 'Paid', subtotal: 27500, disc: 0, tax: 0, total: 27500, reserved: 0, consumed: 1 },
      { id: 'ord-002', num: 'ORD-2026-002', type: 'Room Service', table: null, room_id: 'rm-102', guest_id: 'gst-001', bartender: 'usr-bartender', status: 'Preparing', pay_stat: 'ChargedToRoom', subtotal: 16500, disc: 0, tax: 0, total: 16500, reserved: 1, consumed: 0 },
      { id: 'ord-003', num: 'ORD-2026-003', type: 'Table', table: 'Table 2', room_id: null, guest_id: null, bartender: 'usr-bartender', status: 'Pending', pay_stat: 'Unpaid', subtotal: 9000, disc: 0, tax: 0, total: 9000, reserved: 1, consumed: 0 },
    ];

    for (const o of orders) {
      await dbRun('INSERT IGNORE INTO orders (id, order_number, order_type, table_number, room_id, guest_id, waiter_id, status, payment_status, subtotal, discount, tax, total_amount, stock_reserved, stock_consumed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        o.id, o.num, o.type, o.table, o.room_id, o.guest_id, o.bartender, o.status, o.pay_stat, o.subtotal, o.disc, o.tax, o.total, o.reserved, o.consumed
      ]);
    }

    const orderItems = [
      // ORD-001 items (Completed)
      { id: 'oit-1', order_id: 'ord-001', menu_id: 'menu-chk-chips', name: 'Golden Chicken & Chips', unit_price: 12000, qty: 2, total: 24000, notes: 'Extra crispy fries' },
      { id: 'oit-2', order_id: 'ord-001', menu_id: 'menu-beer', name: 'Chilled Craft Draught Beer', unit_price: 3500, qty: 1, total: 3500, notes: null },

      // ORD-002 items (Preparing - Room Service)
      { id: 'oit-3', order_id: 'ord-002', menu_id: 'menu-beef-rice', name: 'Char-Grilled Beef Steak & Rice', unit_price: 15500, qty: 1, total: 15500, notes: 'Medium rare' },
      { id: 'oit-4', order_id: 'ord-002', menu_id: 'menu-water', name: 'Natural Spring Mineral Water', unit_price: 1000, qty: 1, total: 1000, notes: null },

      // ORD-003 items (Pending - Table 2)
      { id: 'oit-5', order_id: 'ord-003', menu_id: 'menu-wine-glass', name: 'Cabernet Red Wine (Glass)', unit_price: 6000, qty: 1, total: 6000, notes: null },
      { id: 'oit-6', order_id: 'ord-003', menu_id: 'menu-oj', name: 'Cold Fresh Orange Juice', unit_price: 3000, qty: 1, total: 3000, notes: 'No ice' },
    ];

    for (const oi of orderItems) {
      await dbRun('INSERT IGNORE INTO order_items (id, order_id, menu_item_id, menu_item_name, unit_price, quantity, total_price, special_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
        oi.id, oi.order_id, oi.menu_id, oi.name, oi.unit_price, oi.qty, oi.total, oi.notes
      ]);
    }

    // 14. Stock Requests
    const stockRequests = [
      { id: 'sr-001', num: 'REQ-2026-001', dept: 'Kitchen', by: 'usr-chef', status: 'Pending', priority: 'Urgent', reason: 'Fresh Tilapia fillets exhausted over the weekend rush' },
      { id: 'sr-002', num: 'REQ-2026-002', dept: 'Housekeeping', by: 'usr-housekeeper', status: 'Approved', priority: 'Normal', reason: 'Guest bathroom soaps for 2nd floor rooms' },
      { id: 'sr-003', num: 'REQ-2026-003', dept: 'Bar', by: 'usr-bartender', status: 'Pending', priority: 'Normal', reason: 'Fresh orange juice inventory approaching minimum stock' },
    ];

    for (const sr of stockRequests) {
      await dbRun('INSERT IGNORE INTO stock_requests (id, request_number, department, requested_by, status, priority, reason, reviewed_by, reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        sr.id, sr.num, sr.dept, sr.by, sr.status, sr.priority, sr.reason, sr.status === 'Approved' ? 'usr-manager' : null, sr.status === 'Approved' ? '2026-08-14 08:00:00' : null
      ]);
    }

    const stockReqItems = [
      { id: 'sri-1', req_id: 'sr-001', item_id: 'inv-fish', qty_req: 15.0, qty_app: 0.0, unit: 'portions' },
      { id: 'sri-2', req_id: 'sr-002', item_id: 'inv-soap', qty_req: 50.0, qty_app: 50.0, unit: 'pieces' },
      { id: 'sri-3', req_id: 'sr-003', item_id: 'inv-juice', qty_req: 10.0, qty_app: 0.0, unit: 'liters' },
    ];

    for (const sri of stockReqItems) {
      await dbRun('INSERT IGNORE INTO stock_request_items (id, request_id, item_id, quantity_requested, quantity_approved, unit) VALUES (?, ?, ?, ?, ?, ?)', [
        sri.id, sri.req_id, sri.item_id, sri.qty_req, sri.qty_app, sri.unit
      ]);
    }

    // 15. Staff Shifts & Attendance
    const shifts = [
      { id: 'sh-001', user_id: 'usr-chef', date: '2026-08-14', start: '06:30', end: '15:00', type: 'Morning', dept: 'Kitchen' },
      { id: 'sh-002', user_id: 'usr-bartender', date: '2026-08-14', start: '07:00', end: '16:00', type: 'Morning', dept: 'Restaurant/Bar' },
      { id: 'sh-003', user_id: 'usr-housekeeper', date: '2026-08-14', start: '08:00', end: '16:30', type: 'Morning', dept: 'Housekeeping' },
      { id: 'sh-004', user_id: 'usr-manager', date: '2026-08-14', start: '08:00', end: '18:00', type: 'Full Day', dept: 'Management' },
      { id: 'sh-005', user_id: 'usr-chef', date: '2026-08-15', start: '11:00', end: '20:00', type: 'Afternoon', dept: 'Kitchen' },
      { id: 'sh-006', user_id: 'usr-bartender', date: '2026-08-15', start: '12:00', end: '21:00', type: 'Afternoon', dept: 'Restaurant/Bar' },
    ];

    for (const sh of shifts) {
      await dbRun('INSERT IGNORE INTO staff_shifts (id, user_id, shift_date, start_time, end_time, shift_type, department, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
        sh.id, sh.user_id, sh.date, sh.start, sh.end, sh.type, sh.dept, 'usr-manager'
      ]);
    }

    const attendanceRecords = [
      { id: 'att-001', user_id: 'usr-chef', date: '2026-08-14', in_time: '2026-08-14 06:28:00', out_time: null, break_min: 30, total: 0, stat: 'Present' },
      { id: 'att-002', user_id: 'usr-bartender', date: '2026-08-14', in_time: '2026-08-14 06:55:00', out_time: null, break_min: 0, total: 0, stat: 'Present' },
      { id: 'att-003', user_id: 'usr-housekeeper', date: '2026-08-14', in_time: '2026-08-14 08:02:00', out_time: null, break_min: 0, total: 0, stat: 'Present' },
      { id: 'att-004', user_id: 'usr-manager', date: '2026-08-14', in_time: '2026-08-14 07:50:00', out_time: null, break_min: 0, total: 0, stat: 'Present' },
    ];

    for (const att of attendanceRecords) {
      await dbRun('INSERT IGNORE INTO attendance (id, user_id, date, clock_in, clock_out, break_duration_minutes, total_hours, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
        att.id, att.user_id, att.date, att.in_time, att.out_time, att.break_min, att.total, att.stat
      ]);
    }

    // 16. Invoices & Payments
    const invoices = [
      { id: 'inv-rec-1', num: 'INV-2026-001', guest_id: 'gst-001', chk_id: 'chk-001', room_id: 'rm-102', sub: 165000, disc: 0, tax: 0, tot: 165000, paid: 55000, due: 110000, stat: 'Partially Paid' },
      { id: 'inv-rec-2', num: 'INV-2026-002', guest_id: 'gst-002', chk_id: 'chk-002', room_id: 'rm-203', sub: 255000, disc: 0, tax: 0, tot: 255000, paid: 100000, due: 155000, stat: 'Partially Paid' },
      { id: 'inv-rec-3', num: 'INV-2026-003', guest_id: 'gst-003', chk_id: 'chk-003', room_id: 'rm-302', sub: 520000, disc: 0, tax: 0, tot: 520000, paid: 200000, due: 320000, stat: 'Partially Paid' },
    ];

    for (const inv of invoices) {
      await dbRun('INSERT IGNORE INTO invoices (id, invoice_number, guest_id, check_in_id, room_id, subtotal, discount, tax, total_amount, amount_paid, balance_due, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        inv.id, inv.num, inv.guest_id, inv.chk_id, inv.room_id, inv.sub, inv.disc, inv.tax, inv.tot, inv.paid, inv.due, inv.stat
      ]);
    }

    const payments = [
      { id: 'pay-001', rec_num: 'RCT-2026-001', inv_id: 'inv-rec-1', order_id: null, guest_id: 'gst-001', amt: 55000, method: 'Credit Card', cat: 'Deposit', by: 'usr-manager' },
      { id: 'pay-002', rec_num: 'RCT-2026-002', inv_id: 'inv-rec-2', order_id: null, guest_id: 'gst-002', amt: 100000, method: 'Mobile Money', cat: 'Deposit', by: 'usr-manager' },
      { id: 'pay-003', rec_num: 'RCT-2026-003', inv_id: 'inv-rec-3', order_id: null, guest_id: 'gst-003', amt: 200000, method: 'Bank Transfer', cat: 'Deposit', by: 'usr-manager' },
      { id: 'pay-004', rec_num: 'RCT-2026-004', inv_id: null, order_id: 'ord-001', guest_id: null, amt: 27500, method: 'Cash', cat: 'Food', by: 'usr-bartender' },
    ];

    for (const p of payments) {
      await dbRun('INSERT IGNORE INTO payments (id, receipt_number, invoice_id, order_id, guest_id, amount, payment_method, payment_category, received_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        p.id, p.rec_num, p.inv_id, p.order_id, p.guest_id, p.amt, p.method, p.cat, p.by
      ]);
    }

    // 17. Expenses
    const expenses = [
      { id: 'exp-001', num: 'EXP-2026-001', cat: 'Kitchen Ingredients', title: 'Weekly Butchery & Poultry Delivery', amt: 145000, method: 'Bank Transfer', sup: 'sup-001', to: 'Fresh Valley Farm', date: '2026-08-12', by: 'usr-manager' },
      { id: 'exp-002', num: 'EXP-2026-002', cat: 'Bar/Drinks', title: 'Soda and Local Beer Restock', amt: 90000, method: 'Credit Card', sup: 'sup-002', to: 'Kigali Beverages Ltd', date: '2026-08-11', by: 'usr-manager' },
      { id: 'exp-003', num: 'EXP-2026-003', cat: 'Cleaning Supplies', title: 'Floor Detergents and Guest Soaps', amt: 48000, method: 'Mobile Money', sup: 'sup-003', to: 'CleanPro Hygiene', date: '2026-08-10', by: 'usr-manager' },
      { id: 'exp-004', num: 'EXP-2026-004', cat: 'Utilities', title: 'High Speed Fiber Internet Bill', amt: 75000, method: 'Bank Transfer', sup: null, to: 'Rwanda Telecom', date: '2026-08-01', by: 'usr-manager' },
      { id: 'exp-005', num: 'EXP-2026-005', cat: 'Maintenance', title: 'Room 204 Air Conditioning Service Spares', amt: 35000, method: 'Cash', sup: null, to: 'CoolAir Technicians', date: '2026-08-13', by: 'usr-manager' },
    ];

    for (const exp of expenses) {
      await dbRun('INSERT IGNORE INTO expenses (id, expense_number, category, title, amount, payment_method, supplier_id, paid_to, expense_date, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        exp.id, exp.num, exp.cat, exp.title, exp.amt, exp.method, exp.sup, exp.to, exp.date, exp.by
      ]);
    }

    // 18. Maintenance Requests
    const maintenanceTickets = [
      { id: 'mnt-001', num: 'MNT-2026-001', room_id: 'rm-204', loc: 'Room 204', type: 'Air Conditioning', desc: 'AC cooling coil freezing up, compressor running loudly', sev: 'High', stat: 'In Progress', by: 'usr-housekeeper', to: 'CoolAir Technicians' },
      { id: 'mnt-002', num: 'MNT-2026-002', room_id: 'rm-103', loc: 'Room 103', type: 'Plumbing', desc: 'Slow draining shower tray observed during turnover', sev: 'Medium', stat: 'Reported', by: 'usr-housekeeper', to: null },
    ];

    for (const m of maintenanceTickets) {
      await dbRun('INSERT IGNORE INTO maintenance_requests (id, ticket_number, room_id, location, issue_type, description, severity, status, reported_by, assigned_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        m.id, m.num, m.room_id, m.loc, m.type, m.desc, m.sev, m.stat, m.by, m.to
      ]);
    }

    // 19. Notifications
    const notifications = [
      { id: 'notif-1', type: 'low_stock', title: 'Low Stock Alert: Fresh Orange Juice', msg: 'Orange Juice stock is at 4.0 L (Minimum threshold is 6.0 L). Reorder recommended.', role: 'manager', link: '/inventory' },
      { id: 'notif-2', type: 'low_stock', title: 'Out of Stock: Lake Tilapia', msg: 'Lake Tilapia fillet is at 0 portions. Menu item has been marked unavailable.', role: 'chef', link: '/kitchen' },
      { id: 'notif-3', type: 'new_order', title: 'New Room Service Order #ORD-2026-002', msg: 'Room 102 placed an order for Beef Steak & Rice.', role: 'chef', link: '/kitchen' },
      { id: 'notif-4', type: 'check_in', title: 'Upcoming Arrival: Sarah Johnson', msg: 'Guest arriving tomorrow for Deluxe Suite Room 201.', role: 'manager', link: '/rooms' },
      { id: 'notif-5', type: 'maintenance', title: 'Maintenance Ticket MNT-2026-001 In Progress', msg: 'Room 204 AC servicing in progress.', role: 'housekeeper', link: '/housekeeping' },
    ];

    for (const n of notifications) {
      await dbRun('INSERT IGNORE INTO notifications (id, type, title, message, target_role, link) VALUES (?, ?, ?, ?, ?, ?)', [
        n.id, n.type, n.title, n.msg, n.role, n.link
      ]);
    }

    // 20. Audit Logs
    const auditLogs = [
      { id: 'aud-001', uid: 'usr-admin', uname: 'admin', role: 'admin', module: 'Auth', action: 'Login', rec: 'usr-admin', det: 'Administrator logged into system from web console' },
      { id: 'aud-002', uid: 'usr-chef', uname: 'chef', role: 'chef', module: 'Menu', action: 'Status Change', rec: 'menu-fish-tilapia', det: 'Deactivated "Chef Special Grilled Tilapia" (Reason: Tilapia fillet out of stock)' },
      { id: 'aud-003', uid: 'usr-bartender', uname: 'bartender', role: 'bartender', module: 'Orders', action: 'Created', rec: 'ord-002', det: 'Created Room Service order ORD-2026-002 for Room 102 (FRw16500)' },
      { id: 'aud-004', uid: 'usr-manager', uname: 'manager', role: 'manager', module: 'Rooms', action: 'Status Change', rec: 'rm-102', det: 'Checked in Guest John Smith to Room 102' },
      { id: 'aud-005', uid: 'usr-manager', uname: 'manager', role: 'manager', module: 'Inventory', action: 'Approval', rec: 'sr-002', det: 'Approved stock request REQ-2026-002 for 50 Guest Botanical Soaps' },
    ];

    for (const a of auditLogs) {
      await dbRun('INSERT IGNORE INTO audit_logs (id, user_id, username, role, module, action, record_id, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
        a.id, a.uid, a.uname, a.role, a.module, a.action, a.rec, a.det
      ]);
    }
  });

  console.log('Motel relational database successfully seeded with realistic sample records!');
}
