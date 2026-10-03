-- =============================================================================
-- Voltline demo catalog (fictional products). Prices are in centavos (BRL).
-- Demo users are created separately with `npm run seed:users`, which uses the
-- Supabase Admin API so passwords are hashed by Supabase Auth.
-- =============================================================================

insert into public.categories (name, slug, description, sort_order) values
  ('Keyboards',   'keyboards',   'Mechanical and low-profile keyboards tuned for typing and play.', 1),
  ('Mice',        'mice',        'Precise sensors, light shells and all-day ergonomics.', 2),
  ('Audio',       'audio',       'Headphones and microphones for focus, calls and creating.', 3),
  ('Monitors',    'monitors',    'Sharp, fast displays for work and play.', 4),
  ('Accessories', 'accessories', 'Hubs, cameras and controllers that complete the setup.', 5),
  ('Storage',     'storage',     'Fast, reliable storage for your system and projects.', 6);

with c as (select id, slug from public.categories)
insert into public.products
  (category_id, name, slug, description, price_cents, image_url, stock_quantity, is_active, is_featured)
values
  ((select id from c where slug = 'keyboards'), 'Arc75 Wireless Mechanical Keyboard', 'arc75-wireless-mechanical-keyboard',
   'A 75% gasket-mounted keyboard with hot-swappable switches, PBT double-shot keycaps and tri-mode connectivity (USB-C, 2.4 GHz and Bluetooth 5.3). The 4,000 mAh battery lasts up to 200 hours with backlight off.',
   89900, 'https://images.unsplash.com/photo-1595225476474-87563907a212', 24, true, true),

  ((select id from c where slug = 'keyboards'), 'Ember 65 Hot-Swap Keyboard', 'ember-65-hot-swap-keyboard',
   'Compact 65% layout with an aluminium top case, pre-lubed linear switches and a silicone dampening stack for a deep, quiet sound. Wired USB-C with a detachable braided cable.',
   64900, 'https://images.unsplash.com/photo-1618384887929-16ec33fab9ef', 12, true, false),

  ((select id from c where slug = 'keyboards'), 'Linea Slim Office Keyboard', 'linea-slim-office-keyboard',
   'Full-size scissor-switch keyboard with a numeric pad, quiet keystrokes and multi-device pairing for up to three computers. Rechargeable, with up to three months of battery life.',
   34900, 'https://images.unsplash.com/photo-1541140532154-b024d705b90a', 40, true, false),

  ((select id from c where slug = 'mice'), 'Vector Pro Wireless Gaming Mouse', 'vector-pro-wireless-gaming-mouse',
   'A 58 g ultralight shell with a 26K DPI optical sensor, optical switches rated for 90 million clicks and 1 ms 2.4 GHz wireless. PTFE feet and up to 80 hours per charge.',
   54900, 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7', 18, true, true),

  ((select id from c where slug = 'mice'), 'Prism RGB Gaming Mouse', 'prism-rgb-gaming-mouse',
   'Wired gaming mouse with 16.8M-colour RGB zones, six programmable buttons and onboard memory for five DPI profiles. Paracord-style cable for a drag-free glide.',
   27900, 'https://images.unsplash.com/photo-1629429408209-1f912961dbd8', 0, true, false),

  ((select id from c where slug = 'mice'), 'Glide Ergonomic Wireless Mouse', 'glide-ergonomic-wireless-mouse',
   'Sculpted right-handed shape with a soft-touch finish, silent clicks and a hyper-fast scroll wheel. Connects over Bluetooth or the included USB-C receiver.',
   19900, 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46', 55, true, false),

  ((select id from c where slug = 'audio'), 'Pulse ANC Wireless Headphones', 'pulse-anc-wireless-headphones',
   'Hybrid active noise cancelling, 40 mm dynamic drivers and up to 45 hours of playback. Multipoint Bluetooth 5.3 keeps your laptop and phone connected at the same time.',
   129900, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e', 9, true, true),

  ((select id from c where slug = 'audio'), 'Reference Studio Headphones', 'reference-studio-headphones',
   'Closed-back studio headphones with a flat, honest frequency response for mixing and editing. Swivelling ear cups, replaceable velour pads and a detachable 3 m cable.',
   74900, 'https://images.unsplash.com/photo-1583394838336-acd977736f90', 3, true, false),

  ((select id from c where slug = 'audio'), 'Echo USB Condenser Microphone', 'echo-usb-condenser-microphone',
   'Cardioid condenser microphone with 24-bit/96 kHz USB-C output, zero-latency headphone monitoring and a tap-to-mute capacitive sensor. Ships with a desk boom arm and pop filter.',
   99900, 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc', 16, true, true),

  ((select id from c where slug = 'monitors'), 'Vista 27" 4K IPS Monitor', 'vista-27-4k-ips-monitor',
   '27-inch 4K IPS panel covering 98% DCI-P3, factory-calibrated to ΔE < 2. USB-C with 90 W power delivery turns it into a single-cable laptop dock.',
   249900, 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf', 7, true, true),

  ((select id from c where slug = 'monitors'), 'Horizon 34" Ultrawide 165 Hz', 'horizon-34-ultrawide-165hz',
   '34-inch 1500R curved WQHD display with a 165 Hz refresh rate, 1 ms response time and adaptive sync. A height-adjustable stand and VESA mount are included.',
   389900, 'https://images.unsplash.com/photo-1598550476439-6847785fcea6', 4, true, false),

  ((select id from c where slug = 'accessories'), 'Nexus 8-in-1 USB-C Hub', 'nexus-8-in-1-usb-c-hub',
   'Aluminium hub with 4K60 HDMI, 100 W pass-through charging, gigabit Ethernet, SD and microSD readers plus two 10 Gbps USB-A ports. Fits in any laptop sleeve.',
   32900, 'https://images.unsplash.com/photo-1616578273461-3a99ce422de6', 60, true, false),

  ((select id from c where slug = 'accessories'), 'Clarity 4K Streaming Webcam', 'clarity-4k-streaming-webcam',
   '4K30 / 1080p60 webcam with a large 1/2.8" sensor, auto light correction and dual noise-reducing microphones. Includes a privacy shutter and a universal mount.',
   79900, 'https://images.unsplash.com/photo-1593640408182-31c70c8268f5', 11, true, false),

  ((select id from c where slug = 'accessories'), 'Nova Wireless Controller', 'nova-wireless-controller',
   'Hall-effect sticks that never drift, remappable back paddles and a 1,000 Hz wired / wireless polling rate. Works with PC, Android and iOS out of the box.',
   42900, 'https://images.unsplash.com/photo-1592840496694-26d035b52b48', 22, true, false),

  ((select id from c where slug = 'storage'), 'Bolt 2TB NVMe SSD', 'bolt-2tb-nvme-ssd',
   'PCIe 4.0 NVMe M.2 2280 drive with sequential reads up to 7,300 MB/s and a graphene heat spreader. Backed by a five-year limited warranty.',
   114900, 'https://images.unsplash.com/photo-1531492746076-161ca9bcad58', 30, true, false);
