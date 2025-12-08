/**
 * Sistema de Autenticação por Senha para Rhyla
 * Versão: 1.0.8
 * Protege a documentação com senha configurável
 */

(function() {
  console.log('[RHYLA AUTH] Inicializando sistema de autenticação');
  
  // Verificar se a autenticação está habilitada
  let authConfig = null;
  
  // Tentar carregar a configuração
  function loadConfig() {
    return fetch('/config.json')
      .then(response => response.json())
      .then(config => {
        if (config && config.password_doc && config.password_doc.enabled) {
          authConfig = config.password_doc;
          return true;
        }
        return false;
      })
      .catch(err => {
        console.error('[RHYLA AUTH] Erro ao carregar configuração:', err);
        return false;
      });
  }
  
  // Chaves para localStorage
  const AUTH_KEY = 'rhyla_auth_token';
  const ATTEMPTS_KEY = 'rhyla_auth_attempts';
  const BLOCK_KEY = 'rhyla_auth_blocked_until';
  
  // Verificar se está autenticado
  function isAuthenticated() {
    const token = localStorage.getItem(AUTH_KEY);
    return token === 'authenticated';
  }
  
  // Verificar se está bloqueado
  function isBlocked() {
    const blockedUntil = localStorage.getItem(BLOCK_KEY);
    if (!blockedUntil) return false;
    
    const now = Date.now();
    const blockTime = parseInt(blockedUntil);
    
    if (now < blockTime) {
      return blockTime;
    }
    
    // Desbloqueado, limpar
    localStorage.removeItem(BLOCK_KEY);
    localStorage.setItem(ATTEMPTS_KEY, '0');
    return false;
  }
  
  // Obter número de tentativas
  function getAttempts() {
    return parseInt(localStorage.getItem(ATTEMPTS_KEY) || '0');
  }
  
  // Incrementar tentativas
  function incrementAttempts() {
    const attempts = getAttempts() + 1;
    localStorage.setItem(ATTEMPTS_KEY, attempts.toString());
    return attempts;
  }
  
  // Bloquear acesso
  function blockAccess() {
    const blockUntil = Date.now() + (5 * 60 * 1000); // 5 minutos
    localStorage.setItem(BLOCK_KEY, blockUntil.toString());
  }
  
  // Resetar tentativas
  function resetAttempts() {
    localStorage.setItem(ATTEMPTS_KEY, '0');
  }
  
  // Criar overlay de autenticação
  function createAuthOverlay() {
    // Criar overlay de fundo
    const overlay = document.createElement('div');
    overlay.id = 'rhyla-auth-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(10px);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    
    // Criar card de login
    const card = document.createElement('div');
    card.style.cssText = `
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 16px;
      padding: 0;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      max-width: 420px;
      width: 90%;
      text-align: center;
      overflow: hidden;
    `;
    
    // Verificar se está bloqueado
    const blocked = isBlocked();
    
    if (blocked) {
      const remainingTime = Math.ceil((blocked - Date.now()) / 1000 / 60);
      card.innerHTML = `
        <div style="background: white; padding: 40px; border-radius: 16px;">
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin: 0 auto 24px; display: block;">
            <circle cx="12" cy="12" r="10" fill="#fee2e2"/>
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="#dc2626"/>
          </svg>
          <h2 style="margin: 0 0 12px; color: #1f2937; font-size: 28px; font-weight: 700;">Access Blocked</h2>
          <p style="color: #6b7280; margin: 0 0 24px; font-size: 15px;">Too many incorrect attempts.</p>
          <div style="background: #fef2f2; border: 2px solid #fecaca; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <p style="color: #dc2626; font-weight: 600; font-size: 20px; margin: 0;">Try again in ${remainingTime} minute(s)</p>
          </div>
          <p style="color: #9ca3af; font-size: 13px; margin: 0;">Please contact the administrator if you need access.</p>
        </div>
        <div style="background: rgba(255,255,255,0.1); padding: 16px; border-top: 1px solid rgba(255,255,255,0.2);">
          <p style="margin: 0; font-size: 12px; color: rgba(255,255,255,0.8);">
            Made with <a href="https://rhyladoc.com" target="_blank" style="color: white; text-decoration: none; font-weight: 600;">Rhyla</a>
          </p>
        </div>
      `;
    } else {
      const attempts = getAttempts();
      const remainingAttempts = 5 - attempts;
      
      card.innerHTML = `
        <div style="background: white; padding: 40px; border-radius: 16px 16px 0 0;">
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin: 0 auto 24px; display: block;">
            <circle cx="12" cy="12" r="10" fill="#dbeafe"/>
            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" fill="#2563eb"/>
          </svg>
          <h2 style="margin: 0 0 8px; color: #1f2937; font-size: 28px; font-weight: 700;">Protected Documentation</h2>
          <p style="color: #6b7280; margin: 0 0 28px; font-size: 15px;">Enter password to access</p>
          
          <div id="rhyla-auth-error" style="
            color: #dc2626; 
            background: #fef2f2;
            border: 1px solid #fecaca;
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 16px; 
            min-height: 20px; 
            font-size: 14px;
            font-weight: 500;
            display: none;
          "></div>
          
          ${attempts > 0 ? `
            <div style="
              background: #fef3c7;
              border: 1px solid #fcd34d;
              border-radius: 8px;
              padding: 12px;
              margin-bottom: 20px;
            ">
              <p style="color: #d97706; font-size: 14px; margin: 0; font-weight: 600;">
                ⚠️ Remaining attempts: ${remainingAttempts}
              </p>
            </div>
          ` : ''}
          
          <form id="rhyla-auth-form" style="margin-bottom: 0;">
            <div style="position: relative; margin-bottom: 16px;">
              <input 
                type="password" 
                id="rhyla-password-input" 
                placeholder="Enter your password"
                style="
                  width: 100%;
                  padding: 14px 16px;
                  border: 2px solid #e5e7eb;
                  border-radius: 10px;
                  font-size: 16px;
                  box-sizing: border-box;
                  transition: all 0.3s ease;
                  outline: none;
                "
                onfocus="this.style.borderColor='#667eea'; this.style.boxShadow='0 0 0 3px rgba(102, 126, 234, 0.1)'"
                onblur="this.style.borderColor='#e5e7eb'; this.style.boxShadow='none'"
                autofocus
              />
            </div>
            <button 
              type="submit"
              id="rhyla-submit-btn"
              style="
                width: 100%;
                padding: 14px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                border-radius: 10px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
              "
              onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(102, 126, 234, 0.5)'"
              onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(102, 126, 234, 0.4)'"
            >
              Unlock Documentation
            </button>
          </form>
          
          <p style="color: #9ca3af; font-size: 13px; margin: 24px 0 0; line-height: 1.5;">
            Don't have access? <br>
            <span style="color: #6b7280; font-weight: 500;">Contact the administrator</span>
          </p>
        </div>
        
        <div style="background: rgba(255,255,255,0.1); padding: 16px; backdrop-filter: blur(10px);">
          <p style="margin: 0; font-size: 12px; color: rgba(255,255,255,0.9); letter-spacing: 0.3px;">
            Made with ❤️ by <a href="https://rhyladoc.com" target="_blank" style="color: white; text-decoration: none; font-weight: 600; border-bottom: 1px solid rgba(255,255,255,0.5); transition: border-color 0.3s;" onmouseover="this.style.borderColor='white'" onmouseout="this.style.borderColor='rgba(255,255,255,0.5)'">Rhyla</a>
          </p>
        </div>
      `;
    }
    
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    
    // Aplicar opacidade ao conteúdo
    const content = document.querySelector('body > *:not(#rhyla-auth-overlay)');
    if (content) {
      document.body.style.overflow = 'hidden';
    }
    
    // Se não estiver bloqueado, adicionar evento ao formulário
    if (!blocked) {
      const form = document.getElementById('rhyla-auth-form');
      const input = document.getElementById('rhyla-password-input');
      const errorDiv = document.getElementById('rhyla-auth-error');
      
      form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const password = input.value;
        const validPasswords = authConfig.passwords || [];
        
        if (validPasswords.includes(password)) {
          // Senha correta
          localStorage.setItem(AUTH_KEY, 'authenticated');
          resetAttempts();
          overlay.remove();
          document.body.style.overflow = '';
          console.log('[RHYLA AUTH] Autenticação bem-sucedida');
        } else {
          // Senha incorreta
          const attempts = incrementAttempts();
          input.value = '';
          
          if (attempts >= 5) {
            blockAccess();
            console.log('[RHYLA AUTH] Acesso bloqueado por 5 minutos');
            overlay.remove();
            createAuthOverlay(); // Recriar overlay com mensagem de bloqueio
          } else {
            const remaining = 5 - attempts;
            errorDiv.textContent = `❌ Incorrect password! ${remaining} attempt(s) remaining`;
            errorDiv.style.display = 'block';
            input.style.borderColor = '#dc2626';
            input.style.boxShadow = '0 0 0 3px rgba(220, 38, 38, 0.1)';
            
            // Shake animation
            input.style.animation = 'shake 0.5s';
            
            setTimeout(() => {
              input.style.borderColor = '#e5e7eb';
              input.style.boxShadow = 'none';
              input.style.animation = '';
              errorDiv.style.display = 'none';
            }, 3000);
          }
        }
      });
      
      // Focus no input
      setTimeout(() => input.focus(), 100);
    }
  }
  
  // Aplicar opacidade ao conteúdo principal
  function applyContentOpacity() {
    const style = document.createElement('style');
    style.textContent = `
      body:has(#rhyla-auth-overlay) > *:not(#rhyla-auth-overlay) {
        opacity: 0.3;
        pointer-events: none;
      }
      
      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        10%, 30%, 50%, 70%, 90% { transform: translateX(-8px); }
        20%, 40%, 60%, 80% { transform: translateX(8px); }
      }
    `;
    document.head.appendChild(style);
  }
  
  // Inicializar autenticação
  function initAuth() {
    loadConfig().then(enabled => {
      if (!enabled) {
        console.log('[RHYLA AUTH] Autenticação não habilitada');
        return;
      }
      
      console.log('[RHYLA AUTH] Autenticação habilitada');
      
      // Verificar se já está autenticado
      if (isAuthenticated()) {
        console.log('[RHYLA AUTH] Usuário já autenticado');
        return;
      }
      
      // Aplicar opacidade ao conteúdo
      applyContentOpacity();
      
      // Mostrar overlay de autenticação
      createAuthOverlay();
    });
  }
  
  // Iniciar quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuth);
  } else {
    initAuth();
  }
  
  // Adicionar comando para logout (útil para desenvolvimento)
  window.rhylaLogout = function() {
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(ATTEMPTS_KEY);
    localStorage.removeItem(BLOCK_KEY);
    location.reload();
  };
})();
