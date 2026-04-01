// Test to make sure script loads
console.log('Script loaded successfully');

// Supabase Configuration
const SUPABASE_URL = 'https://rbofjfiolntwfaxutyee.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJib2ZqZmlvbG50d2ZheHV0eWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MTUyODAsImV4cCI6MjA5MDE5MTI4MH0.zr0K1KjeDD0ZmHLQQB7ilWIwCJq4rZQN24R_JNWCcCw';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// State
let currentUser = null;
let currentRoom = null;
let rooms = [];
let currentElements = [];
let realtimeChannel = null; // FIX: track to avoid duplicate subscriptions on re-login

// Templates
const templates = {
    modern: {
        name: "🏢 Modern Living Room",
        elements: [
            { category: "furniture", title: "Minimalist Sofa", description: "Clean lines, neutral fabric" },
            { category: "color", title: "Charcoal Gray", color: "#2c3e2f" },
            { category: "lighting", title: "Track Lighting", description: "Adjustable spotlights" }
        ]
    },
    bohemian: {
        name: "🌿 Bohemian Paradise",
        elements: [
            { category: "furniture", title: "Rattan Chair", description: "Natural woven texture" },
            { category: "color", title: "Terracotta", color: "#e2725b" },
            { category: "plants", title: "Hanging Plants", description: "Macrame plant holders" }
        ]
    },
    minimalist: {
        name: "⬜ Minimalist Space",
        elements: [
            { category: "color", title: "Pure White", color: "#f5f5f5" },
            { category: "furniture", title: "Platform Bed", description: "Low profile, clean frame" },
            { category: "decor", title: "Single Artwork", description: "One statement piece" }
        ]
    },
    scandinavian: {
        name: "❄️ Scandinavian Retreat",
        elements: [
            { category: "color", title: "Soft White", color: "#e8e4df" },
            { category: "furniture", title: "Birch Wood Table", description: "Light natural wood" },
            { category: "lighting", title: "Pendant Lamp", description: "Simple geometric shade" }
        ]
    }
};

// ============= AUTH =============
async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        currentUser = session.user;
        showDashboard();
        await loadRooms();
        setupRealtime();
    } else {
        showAuth();
    }
}

async function login(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
        showMessage('authMessage', error.message, 'error');
        return false;
    }
    currentUser = data.user;
    showDashboard();
    await loadRooms();
    setupRealtime();
    return true;
}

async function signup(email, password) {
    const { error } = await supabaseClient.auth.signUp({ email, password });
    if (error) {
        showMessage('authMessage', error.message, 'error');
        return false;
    }
    showMessage('authMessage', 'Account created! Please login.', 'success');
    return true;
}

async function logout() {
    // FIX: unsubscribe realtime channel on logout to prevent stacking
    if (realtimeChannel) {
        supabaseClient.removeChannel(realtimeChannel);
        realtimeChannel = null;
    }
    await supabaseClient.auth.signOut();
    currentUser = null;
    currentRoom = null;
    rooms = [];
    currentElements = [];
    showAuth();
}

// ============= ROOMS =============
async function loadRooms() {
    const { data, error } = await supabaseClient
        .from('rooms')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) return;
    rooms = data || [];
    renderRoomsList();
}

async function createRoom(name) {
    const { error } = await supabaseClient
        .from('rooms')
        .insert([{ name, user_id: currentUser.id }]);

    if (error) {
        showMessage('dashboardMessage', error.message, 'error');
        return;
    }
    await loadRooms();
    showMessage('dashboardMessage', '✅ Room created!', 'success');
}

async function deleteRoom(roomId) {
    const { error } = await supabaseClient
        .from('rooms')
        .delete()
        .eq('id', roomId);

    if (error) return;

    if (currentRoom && currentRoom.id === roomId) {
        currentRoom = null;
        currentElements = [];
        renderMoodboard();
        enableAddButton(false);
    }
    await loadRooms();
}

// ============= ELEMENTS =============
async function loadElements(roomId) {
    const { data, error } = await supabaseClient
        .from('design_ideas')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false });

    if (error) return;
    currentElements = data || [];
    renderMoodboard();
}

async function addElement(element) {
    const insertData = {
        room_id: currentRoom.id,
        category: element.category,
        title: element.title,
        description: element.description || null,
        image_url: element.image_url || null,
        color: element.color || null
    };

    const { error } = await supabaseClient
        .from('design_ideas')
        .insert([insertData]);

    if (error) {
        showMessage('dashboardMessage', error.message, 'error');
        return;
    }
    await loadElements(currentRoom.id);
    showMessage('dashboardMessage', '✅ Element added!', 'success');
}

async function deleteElement(elementId) {
    const { error } = await supabaseClient
        .from('design_ideas')
        .delete()
        .eq('id', elementId);

    if (error) return;
    await loadElements(currentRoom.id);
}

// ============= RENDER =============
function renderRoomsList() {
    const roomsList = document.getElementById('roomsList');
    if (!roomsList) return;

    if (rooms.length === 0) {
        roomsList.innerHTML = '<div style="padding: 1rem; text-align: center; color: #888;">✨ No rooms yet<br><button onclick="createNewRoom()" style="margin-top: 0.5rem;">+ Create First Room</button></div>';
        return;
    }

    roomsList.innerHTML = rooms.map(room => `
        <div class="room-item ${currentRoom?.id === room.id ? 'active' : ''}" onclick="selectRoom('${room.id}')">
            <div class="room-name">🏠 ${escapeHtml(room.name)}</div>
            <div class="room-actions" onclick="event.stopPropagation()">
                <button onclick="editRoom('${room.id}', '${escapeHtml(room.name)}')">✏️</button>
                <button onclick="deleteRoom('${room.id}')">🗑️</button>
            </div>
        </div>
    `).join('');
}

function renderMoodboard() {
    const canvas = document.getElementById('moodboardCanvas');
    if (!canvas) return;

    if (!currentRoom) {
        canvas.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🎨</div>
                <h3>Select a Room</h3>
                <p>Choose a room from the sidebar or create a new one</p>
                <button class="btn btn-primary" onclick="createNewRoom()">+ Create New Room</button>
            </div>
        `;
        enableAddButton(false);
        return;
    }

    enableAddButton(true);

    if (currentElements.length === 0) {
        canvas.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">✨</div>
                <h3>Empty Moodboard</h3>
                <p>Click "Add Element" to start building your design</p>
            </div>
        `;
        return;
    }

    canvas.innerHTML = `
        <div class="moodboard-grid">
            ${currentElements.map(element => renderElementCard(element)).join('')}
        </div>
    `;
}

function renderElementCard(element) {
    const categoryIcons = { furniture: '🪑', color: '🎨', lighting: '💡', decor: '✨', plants: '🌿' };

    if (element.image_url) {
        return `
            <div class="moodboard-card">
                <img src="${element.image_url}" class="card-image" onerror="this.style.display='none'">
                <button class="card-remove" onclick="deleteElement('${element.id}')">✕</button>
                <div class="card-content">
                    <div class="card-category">${categoryIcons[element.category] || '📌'} ${element.category}</div>
                    <div class="card-title">${escapeHtml(element.title)}</div>
                    ${element.description ? `<div class="card-description">${escapeHtml(element.description)}</div>` : ''}
                </div>
            </div>
        `;
    } else if (element.color) {
        return `
            <div class="moodboard-card">
                <div class="card-color" style="background: ${element.color}; display: flex; align-items: center; justify-content: center; min-height: 120px;"></div>
                <button class="card-remove" onclick="deleteElement('${element.id}')">✕</button>
                <div class="card-content">
                    <div class="card-category">${categoryIcons[element.category] || '📌'} ${element.category}</div>
                    <div class="card-title">${escapeHtml(element.title)}</div>
                    <div class="card-description">${element.color}</div>
                </div>
            </div>
        `;
    } else {
        return `
            <div class="moodboard-card">
                <div class="card-color" style="background: #f5efe8; display: flex; align-items: center; justify-content: center; min-height: 120px;">
                    <div style="font-size: 3rem;">${categoryIcons[element.category] || '📌'}</div>
                </div>
                <button class="card-remove" onclick="deleteElement('${element.id}')">✕</button>
                <div class="card-content">
                    <div class="card-category">${element.category}</div>
                    <div class="card-title">${escapeHtml(element.title)}</div>
                    ${element.description ? `<div class="card-description">${escapeHtml(element.description)}</div>` : ''}
                </div>
            </div>
        `;
    }
}

function enableAddButton(enabled) {
    const addBtn = document.getElementById('addElementBtn');
    if (addBtn) addBtn.disabled = !enabled;
}

// ============= ROOM SELECTION =============
window.selectRoom = async (roomId) => {
    currentRoom = rooms.find(r => r.id === roomId);
    const titleEl = document.getElementById('selectedRoomTitle');
    if (titleEl) titleEl.textContent = `🎨 ${currentRoom.name}`;
    await loadElements(currentRoom.id);
    renderRoomsList();
};

// ============= MODAL =============
// FIX: HTML modal ID is 'ideaModal', not 'addModal'
function openAddModal() {
    if (!currentRoom) {
        alert('Please select a room first');
        return;
    }

    const modal = document.getElementById('ideaModal'); // FIXED
    if (modal) {
        modal.style.display = 'flex';
        // Reset custom tab fields
        const fields = ['customTitle', 'customDescription', 'customImageUrl'];
        fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const colorEl = document.getElementById('customColor');
        if (colorEl) colorEl.value = '#d4a373';
        switchTab('custom'); // open custom tab by default
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'none';
}

// FIX: HTML input IDs are customCategory/customTitle/customColor/customImageUrl/customDescription
// Original code used elementCategory/elementTitle/elementColor/elementImage/elementDescription (all wrong)
async function saveNewElement() {
    const category = document.getElementById('customCategory').value;        // FIXED
    const title = document.getElementById('customTitle').value.trim();        // FIXED
    const color = document.getElementById('customColor').value;              // FIXED
    const imageUrl = document.getElementById('customImageUrl').value.trim(); // FIXED
    const description = document.getElementById('customDescription').value.trim(); // FIXED

    if (!title) {
        alert('Please enter a title');
        return;
    }

    await addElement({
        category,
        title,
        description,
        image_url: imageUrl || null,
        color: category === 'color' ? color : null
    });

    closeModal('ideaModal'); // FIXED: was 'addModal'
}

// ============= TABS =============
window.switchTab = (tabName) => {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));

    const targetTab = document.getElementById(`${tabName}Tab`);
    if (targetTab) targetTab.classList.add('active');

    const targetBtn = document.querySelector(`.tab-btn[onclick="switchTab('${tabName}')"]`);
    if (targetBtn) targetBtn.classList.add('active');
};

// ============= ELEMENT LIBRARY (Browse Tab) =============
// ============= ELEMENT LIBRARY (Browse Tab) =============
const elementLibrary = [
    // Furniture with images
    { category: 'furniture', title: 'Sectional Sofa', description: 'L-shaped, deep seating', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ3YrRHSKnrE2-NH4dx54AZqsHz0JXmMWd1UA&s' },
    { category: 'furniture', title: 'Accent Chair', description: 'Bold pattern, single seat', image: 'https://www.woodworth.com.pk/cdn/shop/files/Modern-Upholstered-Accent-Chair-Reading-Chair-Sofa-Chair-With-Metal-Legs-And-Throw-Pillow-Side-Chair_1.jpg?v=1710223771' },
    { category: 'furniture', title: 'Coffee Table', description: 'Walnut wood, round', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSDuCF39ysn_OC9Eswm9ig8jVGnEdqtDgA_Og&s' },
    { category: 'furniture', title: 'Bookshelf', description: 'Open frame, 5 shelves', image: 'https://i5.walmartimages.com/seo/Cozy-Castle-Small-Bookshelf-Wood-8-Cube-Storage-Organizer-Book-Shelves-Anti-Tilt-Device-Freestanding-Modern-Bookcase-Bedroom-Office-Living-Room-White_94e4155f-4d97-428d-ae2e-bfd7446a023e.1514756e305b1923ec1dca34c16e5c68.jpeg' },
    { category: 'furniture', title: 'Platform Bed', description: 'Low profile, wooden frame', image: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=200' },
    { category: 'furniture', title: 'Dining Table', description: 'Extendable, oak finish', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSmtvzEu7_dBXkTB8yw1bmRpPLBWG51VtyEGA&s' },
    
    // Colors (no images, just colors)
    { category: 'color', title: 'Sage Green', color: '#87ae73', description: 'Calming natural green' },
    { category: 'color', title: 'Dusty Rose', color: '#dcae96', description: 'Warm romantic pink' },
    { category: 'color', title: 'Navy Blue', color: '#1b2a4a', description: 'Deep sophisticated blue' },
    { category: 'color', title: 'Warm Beige', color: '#d4a373', description: 'Neutral earthy tone' },
    { category: 'color', title: 'Terracotta', color: '#e2725b', description: 'Warm clay color' },
    { category: 'color', title: 'Charcoal Gray', color: '#2c3e2f', description: 'Modern dark gray' },
    
    // Lighting with images
    { category: 'lighting', title: 'Arc Floor Lamp', description: 'Black metal, adjustable', image: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=200' },
    { category: 'lighting', title: 'Pendant Light', description: 'Glass globe, brass finish', image: 'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=200' },
    { category: 'lighting', title: 'Table Lamp', description: 'Ceramic base, linen shade', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSjqntYURfykmFRaGKcIH0F--hRM22ZcfFCeQ&s' },
    { category: 'lighting', title: 'Chandelier', description: 'Crystal droplets, modern', image: 'https://fanarlights.pk/cdn/shop/files/12_627bed01-062f-4023-8ebd-103472eb666e.jpg?v=1744134277&width=1920' },
    { category: 'lighting', title: 'Wall Sconce', description: 'Matte black, adjustable arm', image: 'https://www.vault-light.com/cdn/shop/files/Odin_Modern_Wall_Sconce_LS.png?v=1762979791&width=1024' },
    
    // Decor with images
    { category: 'decor', title: 'Abstract Wall Art', description: 'Large canvas, neutral tones', image: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=200' },
    { category: 'decor', title: 'Round Mirror', description: 'Gold frame, 36" diameter', image: 'https://m.media-amazon.com/images/I/41iP8IRCciL._SL500_.jpg' },
    { category: 'decor', title: 'Ceramic Vase', description: 'Handcrafted, matte finish', image: 'https://cdn11.bigcommerce.com/s-ukqi7wk1fh/images/stencil/1280x1280/products/1311/6650/Original-Deruta-Pottery-Vase-Love-Birds__23403.1749810812.jpg?c=2' },
    { category: 'decor', title: 'Throw Pillows', description: 'Set of 4, mixed textures', image: 'https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?w=200' },
    { category: 'decor', title: 'Decorative Tray', description: 'Marble and brass', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTOUU5skXk314hvWTXNNV7d23mYOqFMizUB1g&s' },
    
    // Plants with images
    { category: 'plants', title: 'Fiddle Leaf Fig', description: 'Large statement plant', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSVA_rnaHMDS2V19Esbc-liNlF3no5hfXDGHw&s' },
    { category: 'plants', title: 'Snake Plant', description: 'Low maintenance, tall', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSplQttxrdaneXGxEhJgx0CP27Z9HpGcHHaQA&s' },
    { category: 'plants', title: 'Monstera', description: 'Tropical, large leaves', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRL3Z5ZOgVCbAoOUqg71eI-bZivAaZdHA8coA&s' },
    { category: 'plants', title: 'Hanging Plant', description: 'Macrame holder, trailing', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ2ydWh1tpbgWIWnz4BPzH3-oLVWbDziqgHjQ&s' },
    { category: 'plants', title: 'Succulent Collection', description: 'Set of 3, low water', image: 'https://www.gardenia.net/wp-content/uploads/2023/05/succulents.webp' }
];

let currentFilter = 'all';

window.filterElements = (category) => {
    currentFilter = category;
    document.querySelectorAll('.cat-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.cat-btn[onclick="filterElements('${category}')"]`);
    if (activeBtn) activeBtn.classList.add('active');
    renderElementLibrary();
};

function renderElementLibrary() {
    const container = document.getElementById('elementLibrary');
    if (!container) return;

    const filtered = currentFilter === 'all'
        ? elementLibrary
        : elementLibrary.filter(e => e.category === currentFilter);

    const categoryIcons = { furniture: '🪑', color: '🎨', lighting: '💡', decor: '✨', plants: '🌿' };

    container.innerHTML = filtered.map(item => `
        <div class="library-item" onclick="addLibraryElement(${JSON.stringify(item).replace(/"/g, '&quot;')})" style="cursor:pointer;">
            <div style="background: ${item.color || '#f5efe8'}; display:flex; align-items:center; justify-content:center; height:80px; border-radius:12px; overflow:hidden;">
                ${item.image ? `<img src="${item.image}" style="width:100%; height:100%; object-fit:cover;">` : 
                  item.color ? `<div style="width:50px; height:50px; border-radius:50%; background:${item.color};"></div>` :
                  `<div style="font-size:2.5rem;">${categoryIcons[item.category] || '📌'}</div>`}
            </div>
            <div style="font-size:0.85rem; margin-top:0.5rem; font-weight:600;">${escapeHtml(item.title)}</div>
            <div style="font-size:0.7rem; color:#888;">${item.category}</div>
        </div>
    `).join('');
}

window.addLibraryElement = async (item) => {
    await addElement({
        category: item.category,
        title: item.title,
        description: item.description || null,
        image_url: item.image || null,  // This saves the image URL
        color: item.color || null
    });
    closeModal('ideaModal');
};
// ============= AI SUGGESTIONS WITH REAL WEB SEARCH =============

async function generateAISuggestions() {
    const promptInput = document.getElementById('aiPrompt');
    const prompt = promptInput?.value.trim();
    
    if (!currentRoom) {
        alert('Please select a room first before searching for ideas.');
        return;
    }

    if (!prompt) {
        alert('Please describe what you want to see (e.g., "sage green velvet sofa")');
        return;
    }

    const container = document.getElementById('aiSuggestions');
    if (container) {
        container.innerHTML = `
            <div class="loading" style="text-align:center; padding:2rem;">
                <div class="spinner"></div>
                <p>Searching the web for "${escapeHtml(prompt)}"...</p>
            </div>`;
    }

    try {
        // Using a search proxy or direct API (Example: Unsplash for high-quality decor images)
        // Replace 'YOUR_ACCESS_KEY' with your actual Unsplash API Key
        const UNSPLASH_KEY = 'HGlEdxp1Yz31ur-UYFDmbjgxt5v1iUAFLqY4MGx0vNc'; 
        const response = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(prompt)}&per_page=6&client_id=${UNSPLASH_KEY}`);
        const data = await response.json();

        if (data.results && data.results.length > 0) {
            let html = `
                <div style="margin-bottom: 1rem; padding: 0.75rem; background: rgba(255,255,255,0.5); backdrop-filter: blur(10px); border-radius: 15px;">
                    <p style="font-size: 0.85rem; color: #8b7a6b;">✨ Results for: <strong style="color:#d4a373;">${escapeHtml(prompt)}</strong></p>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1.5rem;">
            `;

            // Map search results to UI
            html += data.results.map(photo => `
                <div class="search-result-card" onclick="addFromSearch('${escapeHtml(prompt)}', '${photo.urls.regular}', 'decor')" 
                     style="cursor:pointer; background:white; border-radius:15px; overflow:hidden; box-shadow:0 8px 20px rgba(0,0,0,0.05); transition: transform 0.3s ease;">
                    <img src="${photo.urls.small}" style="width:100%; height:150px; object-fit:cover;">
                    <div style="padding:0.75rem;">
                        <div style="font-weight:600; font-size:0.9rem; color:#2c3e2f;">${escapeHtml(photo.alt_description || 'Decor Idea')}</div>
                        <div style="font-size:0.7rem; color:#d4a373; margin-top:0.4rem;">+ Add to Moodboard</div>
                    </div>
                </div>
            `).join('');

            // ADD VARIETY: Suggest a complementary color palette (Wildcard Rule)
            html += `
                <div class="search-result-card" onclick="generateColorPalette()" 
                     style="cursor:pointer; background:#fdf8f5; border: 2px dashed #d4a373; border-radius:15px; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:1rem; text-align:center;">
                    <div style="font-size:1.5rem;">🎨</div>
                    <div style="font-weight:600; font-size:0.8rem; margin-top:0.5rem;">Match with a Palette</div>
                </div>
            `;

            html += `</div>`;
            container.innerHTML = html;
        } else {
            container.innerHTML = `<p style="text-align:center; padding:2rem;">No images found. Try a broader term like "modern furniture".</p>`;
        }
    } catch (err) {
        console.error('Search error:', err);
        container.innerHTML = `<p style="text-align:center; color:red; padding:2rem;">Failed to connect to search service. Please check your API key.</p>`;
    }
}

// Updated Add function to ensure proper data structure for Supabase
window.addFromSearch = async (title, imageUrl, category) => {
    if (!currentRoom) return;
    
    const elementData = {
        category: category,
        title: title,
        description: 'Web Search Result',
        image_url: imageUrl,
        color: null
    };
    
    await addElement(elementData);
    closeModal('ideaModal'); // Closes the "Add Element" modal
    showMessage('dashboardMessage', `✅ Added to ${currentRoom.name}`, 'success');
};

// ============= TEMPLATE =============
window.applyTemplate = async (templateName) => {
    const template = templates[templateName];
    if (!template) return;

    const { error } = await supabaseClient
        .from('rooms')
        .insert([{ name: template.name, user_id: currentUser.id }]);

    if (error) {
        showMessage('dashboardMessage', error.message, 'error');
        return;
    }

    await loadRooms();

    const { data: newRoom } = await supabaseClient
        .from('rooms')
        .select('*')
        .eq('name', template.name)
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (newRoom) {
        for (const element of template.elements) {
            await supabaseClient
                .from('design_ideas')
                .insert([{
                    room_id: newRoom.id,
                    category: element.category,
                    title: element.title,
                    description: element.description || null,
                    image_url: null,
                    color: element.color || null  // FIXED: was element.image (wrong field name)
                }]);
        }
        await selectRoom(newRoom.id);
    }

    showMessage('dashboardMessage', `✨ "${template.name}" created!`, 'success');
};

// ============= UTILITIES =============
function showAuth() {
    document.getElementById('authSection').classList.remove('hidden');
    document.getElementById('dashboardSection').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('authSection').classList.add('hidden');
    document.getElementById('dashboardSection').classList.remove('hidden');
    const userEmailSpan = document.getElementById('userEmail');
    if (userEmailSpan) userEmailSpan.textContent = currentUser.email;
}

function showMessage(elementId, message, type) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = message;
    el.className = `message ${type}`;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 3000);
}

// FIX: original escapeHtml had a logic bug where '>' was never actually escaped
function escapeHtml(str) {
    if (!str) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return str.replace(/[&<>"']/g, m => map[m]);
}

function createNewRoom() {
    const name = prompt('Enter room name:', 'My Design Room');
    if (name && name.trim()) createRoom(name.trim());
}

window.editRoom = async (roomId, currentName) => {
    const newName = prompt('Edit room name:', currentName);
    if (newName && newName !== currentName) {
        const { error } = await supabaseClient
            .from('rooms')
            .update({ name: newName })
            .eq('id', roomId);

        if (!error) {
            if (currentRoom?.id === roomId) currentRoom.name = newName;
            await loadRooms();
        }
    }
};

// FIX: removes old channel before creating new one — prevents duplicate realtime subs on re-login
function setupRealtime() {
    if (realtimeChannel) {
        supabaseClient.removeChannel(realtimeChannel);
    }

    realtimeChannel = supabaseClient
        .channel('changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `user_id=eq.${currentUser.id}` }, () => loadRooms())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'design_ideas' }, () => {
            if (currentRoom) loadElements(currentRoom.id);
        })
        .subscribe();
}

async function exportMoodboard() {
    if (!currentRoom || currentElements.length === 0) {
        alert('Add some elements first!');
        return;
    }

    const canvas = document.getElementById('moodboardCanvas');
    try {
        const screenshot = await html2canvas(canvas, {
            backgroundColor: '#faf8f5',
            scale: 2
        });

        const link = document.createElement('a');
        link.download = `moodboard-${currentRoom.name}.png`;
        link.href = screenshot.toDataURL();
        link.click();

        showMessage('dashboardMessage', '📸 Saved as PNG!', 'success');
    } catch (err) {
        showMessage('dashboardMessage', 'Error saving image', 'error');
    }
}

function copyShareLink() {
    const input = document.getElementById('shareLink');
    if (input) {
        input.select();
        document.execCommand('copy');
        showMessage('dashboardMessage', '🔗 Link copied!', 'success');
    }
}

// ============= COLOR PALETTE GENERATOR =============
function generateColorPalette() {
    const palettes = [
        ['#e8d5b7', '#a8956a', '#6b4f2a', '#3d2b1f'],
        ['#c9e4de', '#87bbb4', '#4a8b82', '#2d5954'],
        ['#f2d7d5', '#d4a4a0', '#b06b65', '#7a3d39'],
        ['#dde5f0', '#a4b8d4', '#5c7fa8', '#2d4f72'],
        ['#e8e0f5', '#b8a8d4', '#7a60b0', '#3d2d72'],
    ];
    const palette = palettes[Math.floor(Math.random() * palettes.length)];
    const container = document.getElementById('colorPalette');
    if (!container) return;
    container.innerHTML = palette.map(color => `
        <div title="${color}" onclick="addColorFromPalette('${color}')"
             style="width:36px; height:36px; border-radius:50%; background:${color}; cursor:pointer;
                    border:2px solid #fff; box-shadow:0 1px 4px rgba(0,0,0,0.15);
                    display:inline-block; margin:2px;">
        </div>
    `).join('');
}

window.addColorFromPalette = async (color) => {
    if (!currentRoom) {
        alert('Please select a room first');
        return;
    }
    await addElement({
        category: 'color',
        title: color,
        description: 'From palette',
        image_url: null,
        color
    });
};

// ============= EVENT LISTENERS =============
document.addEventListener('DOMContentLoaded', () => {

    // Auth
    document.getElementById('loginForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        login(document.getElementById('loginEmail').value, document.getElementById('loginPassword').value);
    });

    document.getElementById('signupForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        signup(document.getElementById('signupEmail').value, document.getElementById('signupPassword').value);
    });

    document.getElementById('logoutBtn')?.addEventListener('click', logout);
    document.getElementById('createRoomBtn')?.addEventListener('click', createNewRoom);

    // FIX: button IDs corrected to match HTML
    const addBtn = document.getElementById('addElementBtn');
    if (addBtn) addBtn.addEventListener('click', openAddModal);

    document.getElementById('saveIdeaBtn')?.addEventListener('click', saveNewElement); // FIXED: was 'saveElementBtn'

    document.getElementById('exportBtn')?.addEventListener('click', exportMoodboard);

    document.getElementById('shareBtn')?.addEventListener('click', () => {
        const shareModal = document.getElementById('shareModal');
        const shareLinkInput = document.getElementById('shareLink');
        if (shareLinkInput) shareLinkInput.value = window.location.href;
        if (shareModal) shareModal.style.display = 'flex';
    });

    document.getElementById('generateIdeasBtn')?.addEventListener('click', generateAISuggestions);
    document.getElementById('generatePaletteBtn')?.addEventListener('click', generateColorPalette);

    // Close modals when clicking backdrop
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });
    });

    renderElementLibrary();
    checkAuth();
});

// ============= GLOBAL EXPORTS =============
window.createNewRoom = createNewRoom;
window.deleteRoom = deleteRoom;
window.deleteElement = deleteElement;
window.openAddModal = openAddModal;
window.closeModal = closeModal;
window.copyShareLink = copyShareLink;
window.generateColorPalette = generateColorPalette;