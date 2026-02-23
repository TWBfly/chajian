from flask import Flask, request, jsonify
from db import init_db, get_db_connection
import sqlite3
import json
import os

app = Flask(__name__)

# Initialize database
if not os.path.exists('prompts.db'):
    init_db()
else:
    # Migration check: Ensure order_index exists
    try:
        conn = sqlite3.connect('prompts.db')
        conn.execute('ALTER TABLE prompts ADD COLUMN order_index INTEGER DEFAULT 0')
        conn.commit()
        conn.close()
        print("Migrated: Added order_index column")
    except sqlite3.OperationalError:
        # Column likely already exists
        pass

def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET,PUT,POST,DELETE,OPTIONS'
    return response

@app.after_request
def after_request(response):
    return add_cors_headers(response)

@app.route('/api/prompts', methods=['GET'])
def get_prompts():
    conn = get_db_connection()
    prompts = conn.execute('SELECT * FROM prompts ORDER BY order_index ASC, updated_at DESC').fetchall()
    conn.close()
    
    result = []
    for p in prompts:
        # Handle cases where order_index might be None (though we set default 0)
        order_idx = p['order_index'] if 'order_index' in p.keys() and p['order_index'] is not None else 0
        
        result.append({
            'id': p['id'],
            'title': p['title'],
            'content': p['content'],
            'tags': json.loads(p['tags']) if p['tags'] else [],
            'createdAt': p['created_at'],
            'updatedAt': p['updated_at'],
            'orderIndex': order_idx
        })
    return jsonify(result)

@app.route('/api/prompts/reorder', methods=['POST'])
def reorder_prompts():
    data = request.json
    # Expects { "orderedIds": ["id1", "id2", ...] }
    ordered_ids = data.get('orderedIds', [])
    
    conn = get_db_connection()
    for idx, prompt_id in enumerate(ordered_ids):
        conn.execute('UPDATE prompts SET order_index = ? WHERE id = ?', (idx, prompt_id))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Reordered successfully'})

@app.route('/api/prompts', methods=['POST'])
def create_prompt():
    data = request.json
    if not data:
        return jsonify({'error': 'No data provided'}), 400
        
    conn = get_db_connection()
    try:
        # Get current min order_index to put new prompt at top (or calculate as needed)
        # If we sort ASC, smaller index is top. So we can use min(order_index) - 1
        min_order = conn.execute('SELECT MIN(order_index) FROM prompts').fetchone()[0]
        if min_order is None:
            min_order = 0
        new_order = min_order - 1
        
        conn.execute(
            'INSERT INTO prompts (id, title, content, tags, created_at, updated_at, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)',
            (data['id'], data['title'], data['content'], json.dumps(data.get('tags', [])), data['createdAt'], data['updatedAt'], new_order)
        )
        conn.commit()
        
        # Return the data with the new orderIndex
        data['orderIndex'] = new_order
        return jsonify(data), 201
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Prompt already exists'}), 409
    finally:
        conn.close()

@app.route('/api/prompts/<id>', methods=['PUT'])
def update_prompt(id):
    data = request.json
    conn = get_db_connection()
    conn.execute(
        'UPDATE prompts SET title = ?, content = ?, tags = ?, updated_at = ? WHERE id = ?',
        (data['title'], data['content'], json.dumps(data.get('tags', [])), data['updatedAt'], id)
    )
    conn.commit()
    conn.close()
    return jsonify(data)

@app.route('/api/prompts/<id>', methods=['DELETE'])
def delete_prompt(id):
    conn = get_db_connection()
    conn.execute('DELETE FROM prompts WHERE id = ?', (id,))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Deleted successfully'})

@app.route('/api/tags', methods=['GET'])
def get_tags():
    conn = get_db_connection()
    tags = conn.execute('SELECT name FROM tags ORDER BY name').fetchall()
    conn.close()
    return jsonify([t['name'] for t in tags])

@app.route('/api/tags', methods=['POST'])
def add_tag():
    data = request.json
    tag_name = data.get('name')
    if not tag_name:
        return jsonify({'error': 'Tag name required'}), 400
        
    conn = get_db_connection()
    try:
        conn.execute('INSERT OR IGNORE INTO tags (name) VALUES (?)', (tag_name,))
        conn.commit()
        return jsonify({'name': tag_name}), 201
    finally:
        conn.close()

@app.route('/api/tags/<name>', methods=['DELETE'])
def delete_tag(name):
    conn = get_db_connection()
    conn.execute('DELETE FROM tags WHERE name = ?', (name,))
    # Also update prompts to remove this tag? 
    # Usually handled by client or separate logic, but let's keep it simple for now.
    # The client logic in popup.js already handles removing tags from prompts locally.
    # We should update prompts in DB too if we want full consistency, 
    # but strictly speaking the prompt JSON blob needs to be updated.
    # For now, let the client handle prompt updates.
    conn.commit()
    conn.close()
    return jsonify({'message': 'Tag deleted'})

# Bulk Sync Endpoint (for migration)
@app.route('/api/sync', methods=['POST'])
def sync_data():
    data = request.json
    prompts = data.get('prompts', [])
    tags = data.get('tags', [])
    
    conn = get_db_connection()
    
    # Sync Tags
    for tag in tags:
        conn.execute('INSERT OR IGNORE INTO tags (name) VALUES (?)', (tag,))
        
    # Sync Prompts
    for p in prompts:
        # Check if exists, update if newer, or insert
        existing = conn.execute('SELECT updated_at FROM prompts WHERE id = ?', (p['id'],)).fetchone()
        if existing:
            if p['updatedAt'] > existing['updated_at']:
                 conn.execute(
                    'UPDATE prompts SET title = ?, content = ?, tags = ?, updated_at = ? WHERE id = ?',
                    (p['title'], p['content'], json.dumps(p.get('tags', [])), p['updatedAt'], p['id'])
                )
        else:
            conn.execute(
                'INSERT INTO prompts (id, title, content, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
                (p['id'], p['title'], p['content'], json.dumps(p.get('tags', [])), p['createdAt'], p['updatedAt'])
            )
            
    conn.commit()
    conn.close()
    return jsonify({'message': 'Sync complete'})

if __name__ == '__main__':
    # Use a different port to avoid conflict with root app.py (5001)
    app.run(debug=True, port=5002)
