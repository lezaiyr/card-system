const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

const PORT = process.env.PORT || 12854;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

let data = { cards: [], announcements: [] };
try { if (fs.existsSync('data.json')) data = JSON.parse(fs.readFileSync('data.json', 'utf8')); } catch(e){}
const saveData = () => fs.writeFileSync('data.json', JSON.stringify(data));
const sessions = {};

const LOGIN_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>登录</title></head><body style="font-family:sans-serif;padding:20px"><h2>管理登录</h2><form id="f"><input type="password" id="pwd" placeholder="管理密码" style="padding:8px"><button type="submit">登录</button></form><script>document.getElementById('f').onsubmit=async(e)=>{e.preventDefault();const p=document.getElementById('pwd').value;const r=await fetch('/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:p})});if(r.ok||r.redirected)location.href='/';else alert('密码错误');};</script></body></html>`;

const ADMIN_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>管理后台</title></head><body style="font-family:sans-serif;padding:20px"><h2>公告管理</h2><textarea id="annContent" rows="4" style="width:100%;max-width:500px"></textarea><br><button onclick="saveAnn()">发布公告</button><p id="msg"></p><h2>卡密管理</h2><input id="code" placeholder="卡密"><input id="exp" type="date"><button onclick="addCard()">添加</button><table border="1" id="tb" style="margin-top:16px;width:100%;max-width:600px"><thead><tr><th>卡密</th><th>状态</th><th>到期</th><th>操作</th></tr></thead><tbody></tbody></table><p><a href="/logout">退出</a></p><script>async function loadAnn(){const r=await fetch('/api/ann').then(r=>r.json());document.getElementById('annContent').value=r.content||'';}async function saveAnn(){await fetch('/api/ann',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:document.getElementById('annContent').value})});document.getElementById('msg').textContent='已发布';}async function loadCards(){const c=await fetch('/api/cards').then(r=>r.json());document.querySelector('#tb tbody').innerHTML=c.map(x=>\`<tr><td>\${x.code}</td><td>\${x.is_used?'已用':'未用'}</td><td>\${x.expires_at?new Date(x.expires_at).toLocaleDateString():'永久'}</td><td><button onclick="delCard(\${x.id})">删</button></td></tr>\`).join('');}async function addCard(){const c=document.getElementById('code').value.trim();const e=document.getElementById('exp').value;await fetch('/api/cards',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:c||undefined,expires_at:e?new Date(e).getTime():null})});document.getElementById('code').value='';loadCards();}async function delCard(id){await fetch('/api/cards?id='+id,{method:'DELETE'});loadCards();}loadAnn();loadCards();</script></body></html>`;

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const path = url.pathname;
        const json = (d, s=200) => { res.writeHead(s, {'Content-Type': 'application/json'}); res.end(JSON.stringify(d)); };
        const isAuth = () => { const c = req.headers.cookie || ''; const m = c.match(/admin_token=([^;]+)/); return m && sessions[m[1]]; };

        if (path === '/' && req.method === 'GET') {
            if (req.headers.accept && req.headers.accept.includes('application/json')) {
                return json({ ok: false, msg: '接口路径错误，请使用 /verify' });
            }
            res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
            res.end(isAuth() ? ADMIN_HTML : LOGIN_HTML);
        } 
        else if (path === '/' && req.method === 'POST') {
            return json({ ok: false, msg: '接口路径错误，请使用 /verify' });
        }
        else if (path === '/login' && req.method === 'POST') {
            try {
                const p = JSON.parse(body || '{}').password;
                if (p === ADMIN_PASSWORD) { const t = crypto.randomBytes(16).toString('hex'); sessions[t] = true; res.writeHead(302, {'Set-Cookie': `admin_token=${t}; Path=/`, 'Location': '/'}); res.end(); }
                else { res.writeHead(403); res.end('Wrong Password'); }
            } catch(e) { res.writeHead(400); res.end('Bad Request'); }
        } 
        else if (path === '/logout') {
            res.writeHead(302, {'Set-Cookie': 'admin_token=; Path=/; Max-Age=0', 'Location': '/'}); res.end();
        } 
        else if (path === '/verify' && (req.method === 'POST' || req.method === 'GET')) {
            let code, device_id;
            if (req.method === 'POST') {
    
