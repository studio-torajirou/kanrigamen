/**
 * api.js
 * GAS通信クライアント & 共通UIライブラリ
 * * [役割]
 * 1. GAS(Google Apps Script)との通信 (fetch API)
 * 2. ローディング画面の制御
 * 3. トースト通知、アラートの表示
 */

// ============================================================================
// ★重要: ここに「デプロイ」>「ウェブアプリ」で発行されたURLを貼り付けてください
// ============================================================================
const API_URL = "https://script.google.com/macros/s/AKfycbwzn7oJAsoc20JyOw77EjbYwWCHHj1DBkIqrCreacNu-KX5l5k8Gx3JEZTlow7P9I3K6g/exec"; 


/**
 * GASとの通信を行う共通関数
 * @param {string} actionName - 実行したいGASの関数名 (例: 'apiGetAdminInit')
 * @param {object} payload - 送信するデータ (省略可)
 * @returns {Promise<object>} - GASからのレスポンスJSON
 */
async function gas(actionName, payload = {}) {
  // 通信開始時にローディングを表示
  setLoading(true);

  // 管理者パスワードがセッションに保存されていれば自動的に付与
  const auth = sessionStorage.getItem('adminPass');
  if (auth) {
    payload.auth = auth;
  }

  // GASのdoPostはCORS制限回避のため text/plain で送るのが定石
  const bodyData = JSON.stringify({
    action: actionName,
    ...payload
  });

  try {
    if (!API_URL) {
      throw new Error("API_URLが設定されていません。api.jsを確認してください。");
    }

    const response = await fetch(API_URL, {
      method: "POST",
      mode: "cors",
      cache: "no-cache",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: bodyData
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const json = await response.json();
    
    // 通信完了時にローディングを非表示
    setLoading(false);

    // GAS側からの論理エラー判定 (success: false の場合)
    if (json.error) {
      console.error("GAS Error:", json.error);
      
      // 認証エラーなら強制ログアウト
      if (json.error.includes('認証エラー') || json.error.includes('auth')) {
        sessionStorage.removeItem('adminPass');
        window.alert('認証セッションが切れました。再ログインしてください。');
        location.reload();
        throw new Error(json.error);
      }
      
      window.alert("エラーが発生しました:\n" + json.error);
      throw new Error(json.error);
    }

    return json;

  } catch (e) {
    setLoading(false);
    console.error("Fetch Error:", e);
    
    if (!e.message || !e.message.includes('GAS Error')) {
      window.alert("通信エラーが発生しました。\n" + e.message);
    }
    throw e;
  }
}

// ==========================================
// 共通UI ヘルパー関数
// ==========================================

/**
 * ローディングスピナーの表示切り替え
 * @param {boolean} flag - true:表示, false:非表示
 */
function setLoading(flag) {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.style.display = flag ? 'flex' : 'none';
  }
}

/**
 * 画面下部にトーストメッセージを表示
 * @param {string} msg - 表示するメッセージ
 */
function showToast(msg) {
  let el = document.getElementById('toast');
  
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  
  el.textContent = msg;
  
  // アニメーション用クラス付与
  requestAnimationFrame(() => {
    el.classList.add('is-show');
  });
  
  // 3秒後に消す
  setTimeout(() => {
    el.classList.remove('is-show');
  }, 3000);
}

/**
 * カスタムアラートを表示 (フォールバック機能付き)
 * @param {string} msg 
 */
function openCustomAlert(msg) {
  var modal = document.getElementById('customAlertModal');
  var msgEl = document.getElementById('customAlertMessage');
  if (modal && msgEl) {
    msgEl.textContent = msg;
    modal.style.display = 'flex';
  } else {
    // モーダルがない場合は標準アラートで代用
    window.alert(msg);
  }
}