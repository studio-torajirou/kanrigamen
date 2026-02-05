/**
 * app.js
 * スタジオ寅次郎 管理画面 メインロジック (最終完成版)
 * * [修正点]
 * 1. 定員取得時の無限ループバグ修正
 * 2. カラーパレットに白・黒を追加
 * 3. 過去日の登録制限
 * 4. 手動入力モード：初期値を空白に変更（入力必須化）
 * 5. 予約有枠の削除禁止制御
 * 6. 強制キャンセル完了メッセージをモーダル化
 */

'use strict';

// =========================================================
// 1. グローバル変数・定数
// =========================================================
const CONSTANTS = {
  ADMIN_PASS: '0126',     // 簡易認証パス
  // カラーパレット定義 (白・黒を追加)
  COLORS: [
    '#ffffff', '#000000', 
    '#e57373', '#f06292', '#ba68c8', '#9575cd', '#7986cb',
    '#64b5f6', '#4fc3f7', '#4dd0e1', '#4db6ac', '#81c784',
    '#aed581', '#dce775', '#fff176', '#ffd54f', '#ffb74d',
    '#ff8a65', '#a1887f', '#e0e0e0', '#90a4ae'
  ]
};

// アプリケーションの状態管理
let adminState = {
  currentDate: new Date(), // 表示中の日付
  lessons: [],             // レッスン枠データ
  packages: [],            // パッケージデータ
  settings: {},            // 設定データ
  customers: [],           // 顧客データ
  selectedDate: null,      // 選択中の日付 (YYYY-MM-DD)
  tempPkg: null            // 新規作成用の一時データ
};

// =========================================================
// 2. データ参照ヘルパー (日本語/英語キー & 欠損値補完)
// =========================================================

/**
 * オブジェクトから値を安全に取り出す
 * keys配列の順に検索し、有効な値があれば返す
 */
function getVal(obj, keys, defaultVal = '') {
  if (!obj) return defaultVal;
  if (!Array.isArray(keys)) keys = [keys];
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') {
      return obj[k];
    }
  }
  return defaultVal;
}

// --- レッスン(枠)・パッケージ情報取得用 ---
const L = {
  getId: (l) => getVal(l, ['slotId', '枠ID', 'id', 'packageId', 'パッケージID']),
  getName: (l) => getVal(l, ['lessonName', 'レッスン名', 'title']),
  getTeacher: (l) => getVal(l, ['teacherName', '先生名']),
  getDesc: (l) => getVal(l, ['description', 'レッスン内容']),
  getDate: (l) => getVal(l, ['date', '日付']),
  getStart: (l) => getVal(l, ['startTime', '開始時刻', 'start']),
  getEnd: (l) => getVal(l, ['endTime', '終了時刻', 'end']),
  getPrice: (l) => Number(getVal(l, ['price', '料金'], 0)),
  
  // ★重要: 定員取得ロジック (無限ループ防止対応済み)
  getCapacity: (l) => {
    let cap = getVal(l, ['capacity', '定員']);
    // 数値として有効ならそれを返す
    if (cap !== '' && cap !== null && cap !== undefined) return Number(cap);
    
    // 枠データに定員がない場合、パッケージIDから親パッケージを探して定員を返す
    const pkgId = getVal(l, ['packageId', 'パッケージID']);
    
    if (pkgId && adminState.packages.length > 0) {
      // 自身がパッケージでないことを確認（IDで検索）
      const parentPkg = adminState.packages.find(p => String(L.getId(p)) === String(pkgId));
      
      if (parentPkg) {
        // ★重要: ここで再帰(L.getCapacity)を呼ぶと、もしparentPkg自体に定員がない場合に
        // 自分自身を何度も参照して無限ループになるため、直接値を取りに行く
        let pCap = getVal(parentPkg, ['capacity', '定員']);
        return (pCap !== '' && pCap !== null && pCap !== undefined) ? Number(pCap) : 0;
      }
    }
    return 0; // それでもなければ0
  },

  getColor: (l) => getVal(l, ['color', 'カレンダー色', '標準色'], '#ccc'),
  
  // 公開設定: 1, '1', true, '公開', '表示' をすべて許可
  getPublic: (l) => {
    const v = getVal(l, ['isPublic', '公開設定', '公開状態']);
    return (v === 1 || v === '1' || v === true || v === '公開' || v === '表示');
  }
};

// --- ゲスト(予約者)情報取得用 ---
const G = {
  getId: (g) => getVal(g, ['reservationId', '予約ID', 'bookingId', 'id']),
  getName: (g) => getVal(g, ['name', '氏名', 'userName']),
  getStatus: (g) => getVal(g, ['status', '状態']),
  getPhone: (g) => getVal(g, ['phone', '電話', '電話番号']),
  getEmail: (g) => getVal(g, ['email', 'Email']),
  getCustId: (g) => getVal(g, ['customerId', '顧客ID'])
};

// =========================================================
// 3. 初期化 & 認証フロー
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
  // セッション認証チェック
  const savedPass = sessionStorage.getItem('adminPass');
  if (savedPass === CONSTANTS.ADMIN_PASS) {
    document.getElementById('authModal').style.display = 'none';
    initAdmin();
  }

  // ログインボタン
  document.getElementById('btnAdminLogin').onclick = () => {
    const input = document.getElementById('adminPassInput').value;
    if (input === CONSTANTS.ADMIN_PASS) {
      sessionStorage.setItem('adminPass', input);
      document.getElementById('authModal').style.display = 'none';
      initAdmin();
    } else {
      document.getElementById('authError').style.display = 'block';
    }
  };

  // カレンダー操作
  document.getElementById('monthPrev').onclick = () => changeMonth(-1);
  document.getElementById('monthNext').onclick = () => changeMonth(1);

  // その他ボタン
  document.getElementById('btnAddSlot').onclick = adminOpenPackageSelectModal;
  document.getElementById('btnNewPackage').onclick = () => adminOpenPackageModal();
  document.getElementById('btnHelp').onclick = adminOpenHelp;
});

/**
 * 管理画面の初期データロード
 */
async function initAdmin() {
  try {
    const res = await gas('apiGetAdminInit');
    if (res.success) {
      adminState.settings = res.settings || {};
      adminState.packages = res.packages || [];
      adminState.customers = res.customers || [];
      adminState.lessons = res.lessons || [];
      
      renderCalendar();
      renderPackageList();
    } else {
      openCustomAlert('初期データの取得に失敗しました。\n' + (res.error || '不明なエラー'));
    }
  } catch (e) {
    console.error(e);
    openCustomAlert('通信エラーが発生しました。再読み込みしてください。');
  }
}

// =========================================================
// 4. カレンダー描画ロジック
// =========================================================

function changeMonth(delta) {
  adminState.currentDate.setMonth(adminState.currentDate.getMonth() + delta);
  renderCalendar();
}

function renderCalendar() {
  const y = adminState.currentDate.getFullYear();
  const m = adminState.currentDate.getMonth();
  
  document.getElementById('monthLabel').textContent = `${y}年 ${m + 1}月`;

  const firstDay = new Date(y, m, 1);
  const lastDay = new Date(y, m + 1, 0);
  const startDate = new Date(firstDay);
  startDate.setDate(1 - startDate.getDay());
  const endDate = new Date(lastDay);
  endDate.setDate(lastDay.getDate() + (6 - lastDay.getDay()));

  const grid = document.getElementById('calendarGrid');
  grid.innerHTML = '';

  // 曜日ヘッダー
  const weeks = ['日','月','火','水','木','金','土'];
  const rowHead = document.createElement('div');
  rowHead.className = 'cal-row';
  weeks.forEach(w => {
    const cell = document.createElement('div');
    cell.className = 'cal-cell-head';
    cell.textContent = w;
    rowHead.appendChild(cell);
  });
  grid.appendChild(rowHead);

  // 日付セル生成
  let current = new Date(startDate);
  let weekRow = document.createElement('div');
  weekRow.className = 'cal-row';

  // 無限ループ防止のため、安全策として最大反復回数を設定
  let loopGuard = 0;
  while (current <= endDate && loopGuard < 100) {
    loopGuard++;
    const dateStr = formatDate(current);
    const dayCell = createDayCell(current, dateStr, m);
    
    // その日の有効なレッスンを抽出
    const dayLessons = adminState.lessons.filter(l => L.getDate(l) === dateStr && getVal(l, ['status', '状態']) !== '削除');
    dayLessons.sort((a, b) => (L.getStart(a) > L.getStart(b) ? 1 : -1));

    const tagsContainer = document.createElement('div');
    tagsContainer.className = 'cal-tags';

    dayLessons.forEach(lesson => {
      // エラーがあっても他のレッスン描画を止めない
      try {
        const tag = createLessonTag(lesson);
        tagsContainer.appendChild(tag);
      } catch (e) {
        console.error("Lesson render error:", e);
      }
    });
    dayCell.appendChild(tagsContainer);

    weekRow.appendChild(dayCell);

    if (current.getDay() === 6) {
      grid.appendChild(weekRow);
      weekRow = document.createElement('div');
      weekRow.className = 'cal-row';
    }
    current.setDate(current.getDate() + 1);
  }
}

function createDayCell(dateObj, dateStr, currentMonthIdx) {
  const cell = document.createElement('div');
  cell.className = 'cal-cell';
  
  if (dateObj.getMonth() !== currentMonthIdx) {
    cell.style.opacity = '0.5';
  }

  if (dateStr === formatDate(new Date())) {
    cell.classList.add('cal-cell-today');
  }

  const dayNum = document.createElement('div');
  dayNum.className = 'cal-day-label';
  dayNum.textContent = dateObj.getDate();
  cell.appendChild(dayNum);

  cell.onclick = (e) => {
    if(e.target.closest('.cal-tag')) return;
    selectDate(dateStr, cell);
  };

  return cell;
}

function createLessonTag(lesson) {
  const tag = document.createElement('div');
  tag.className = 'cal-tag';
  const color = L.getColor(lesson);
  tag.style.backgroundColor = color;
  tag.style.color = isLightColor(color) ? '#442c2e' : '#fff';
  
  // 白背景のときは枠線をつけて視認性を確保 (追加)
  if(color.toLowerCase() === '#ffffff') tag.style.border = '1px solid #ddd';

  // 予約数集計
  const guests = lesson.guests || [];
  let reservedCount = 0;
  let waitCount = 0;
  guests.forEach(g => {
    const status = G.getStatus(g);
    if (status === '予約') reservedCount++;
    else if (status === 'キャンセル待ち') waitCount++;
  });

  const isPublic = L.getPublic(lesson);
  const lockIcon = !isPublic ? '🔒' : '';
  const timeStr = formatTimeShort(L.getStart(lesson));
  const capacity = L.getCapacity(lesson);

  // 表示内容
  const lineTime = document.createElement('div');
  lineTime.textContent = `${lockIcon} ${timeStr}`;
  lineTime.style.marginBottom = '2px';

  const lineTitle = document.createElement('div');
  lineTitle.textContent = L.getName(lesson) || '(名称未設定)';
  lineTitle.style.fontWeight = 'bold';
  lineTitle.style.fontSize = '1.1em';
  lineTitle.style.lineHeight = '1.2';
  lineTitle.style.marginBottom = '2px';

  const lineTeacher = document.createElement('div');
  lineTeacher.textContent = L.getTeacher(lesson) || '';
  lineTeacher.style.fontSize = '0.9em';
  lineTeacher.style.marginBottom = '4px';

  const lineStats = document.createElement('div');
  lineStats.style.fontSize = '0.9em';
  lineStats.textContent = `予約: ${reservedCount}/${capacity} (待: ${waitCount})`;

  if (waitCount > 0) {
    const isDarkBg = !isLightColor(color);
    lineStats.style.color = isDarkBg ? '#ffff00' : '#c62828';
    lineStats.style.fontWeight = 'bold';
  }

  tag.appendChild(lineTime);
  tag.appendChild(lineTitle);
  if (lineTeacher.textContent) tag.appendChild(lineTeacher);
  tag.appendChild(lineStats);

  tag.onclick = (e) => {
    e.stopPropagation();
    adminOpenSlotModal(L.getId(lesson));
  };

  return tag;
}

/**
 * 日付選択時の処理
 */
function selectDate(dateStr, cellEl) {
  adminState.selectedDate = dateStr;
  
  document.querySelectorAll('.cal-cell-selected').forEach(el => el.classList.remove('cal-cell-selected'));
  if (cellEl) cellEl.classList.add('cal-cell-selected');

  const parts = dateStr.split('-');
  document.getElementById('selectedDateLabel').textContent = `${parts[0]}年${parts[1]}月${parts[2]}日`;

  const listEl = document.getElementById('slotList');
  listEl.innerHTML = '';

  const dayLessons = adminState.lessons.filter(l => L.getDate(l) === dateStr && getVal(l, ['status', '状態']) !== '削除');
  dayLessons.sort((a, b) => (L.getStart(a) > L.getStart(b) ? 1 : -1));

  if (dayLessons.length === 0) {
    listEl.innerHTML = '<p class="empty-text">レッスンの登録はありません</p>';
  } else {
    dayLessons.forEach(lesson => {
      const guests = lesson.guests || [];
      let resCount = 0;
      let waitCount = 0;
      guests.forEach(g => {
        const s = G.getStatus(g);
        if (s === '予約') resCount++;
        else if (s === 'キャンセル待ち') waitCount++;
      });

      const capacity = L.getCapacity(lesson);

      const card = document.createElement('div');
      card.className = 'slot-card';
      card.innerHTML = `
        <div class="slot-card-hd">
          <span class="slot-card-time">${formatTimeShort(L.getStart(lesson))} - ${formatTimeShort(L.getEnd(lesson))}</span>
          <span class="slot-card-title">${L.getName(lesson)}</span>
        </div>
        <div class="slot-card-bd">
          予約: <strong>${resCount}</strong> / ${capacity}名 
          ${waitCount > 0 ? `<span style="color:#e53935; font-weight:bold;">(待ち: ${waitCount})</span>` : ''}
          <br>講師: <strong>${L.getTeacher(lesson)}</strong> | 料金: ¥${L.getPrice(lesson)}
        </div>
      `;
      card.onclick = () => adminOpenSlotModal(L.getId(lesson));
      listEl.appendChild(card);
    });
  }
}


// =========================================================
// 5. パッケージ (レッスン雛形) 管理
// =========================================================

function renderPackageList() {
  const container = document.getElementById('packageList');
  if(!container) return;
  container.innerHTML = '';
  
  const validPkgs = adminState.packages.filter(p => getVal(p, ['status', '状態']) !== '削除');
  
  validPkgs.forEach(pkg => {
    const el = document.createElement('div');
    el.className = 'package-card';
    el.style.borderLeft = `6px solid ${L.getColor(pkg)}`;
    el.innerHTML = `
      <div class="package-card-title">${L.getName(pkg)}</div>
      <div class="package-card-desc">${L.getTeacher(pkg)}</div>
      <div class="package-card-price">¥${L.getPrice(pkg)}</div>
    `;
    el.onclick = () => adminOpenPackageModal(L.getId(pkg));
    container.appendChild(el);
  });
}

window.adminOpenPackageModal = function(pkgId = null) {
  const modal = document.getElementById('packageModal');
  const title = document.getElementById('packageModalTitle');
  const delBtn = document.getElementById('packageDeleteBtn');
  
  const fields = ['packageLessonName', 'packageTeacherName', 'packageDescription', 'packagePrice', 'packageCapacity', 'packageColor'];
  fields.forEach(id => document.getElementById(id).value = '');
  document.getElementById('packageIsPublic').checked = true;

  setupColorPicker('packageColorPalette', 'packageColor');

  if (pkgId) {
    // 編集
    const pkg = adminState.packages.find(p => String(L.getId(p)) === String(pkgId));
    if (!pkg) return;
    
    document.getElementById('packageId').value = pkgId;
    document.getElementById('packageLessonName').value = L.getName(pkg);
    document.getElementById('packageTeacherName').value = L.getTeacher(pkg);
    document.getElementById('packageDescription').value = L.getDesc(pkg);
    document.getElementById('packagePrice').value = L.getPrice(pkg);
    document.getElementById('packageCapacity').value = L.getCapacity(pkg);
    
    const color = L.getColor(pkg);
    document.getElementById('packageColor').value = color;
    setupColorPicker('packageColorPalette', 'packageColor', color);
    
    document.getElementById('packageIsPublic').checked = L.getPublic(pkg);
    
    title.textContent = 'パッケージ編集';
    delBtn.style.display = 'block';
    delBtn.onclick = () => {
      document.getElementById('packageDeleteModal').style.display = 'flex';
      document.getElementById('packageDeleteConfirmBtn').onclick = () => deletePackage(pkgId);
    };
  } else {
    // 新規
    document.getElementById('packageId').value = '';
    title.textContent = 'パッケージ新規登録';
    delBtn.style.display = 'none';
    document.getElementById('packageColor').value = CONSTANTS.COLORS[0];
    setupColorPicker('packageColorPalette', 'packageColor', CONSTANTS.COLORS[0]);
  }

  document.getElementById('packageSaveBtn').onclick = savePackage;
  modal.style.display = 'flex';
};

window.adminClosePackageModal = function() {
  document.getElementById('packageModal').style.display = 'none';
};

// パッケージ保存 (apiSavePackage使用)
async function savePackage() {
  const id = document.getElementById('packageId').value;
  const payload = {
    id: id,
    lessonName: document.getElementById('packageLessonName').value,
    teacherName: document.getElementById('packageTeacherName').value,
    description: document.getElementById('packageDescription').value,
    price: Number(document.getElementById('packagePrice').value),
    capacity: Number(document.getElementById('packageCapacity').value),
    color: document.getElementById('packageColor').value,
    isPublic: document.getElementById('packageIsPublic').checked ? 1 : 0
  };

  if (!payload.lessonName) return alert('レッスン名は必須です');

  try {
    const res = await gas('apiSavePackage', payload);
    if (res.success) {
      showToast('パッケージを保存しました');
      adminClosePackageModal();
      initAdmin();
    } else {
      alert('エラー: ' + res.error);
    }
  } catch(e) {
    alert('通信エラー: ' + e.message);
  }
}

async function deletePackage(id) {
  try {
    const res = await gas('apiSavePackage', { id: id, status: '削除' });
    if (res.success) {
      showToast('パッケージを削除しました');
      document.getElementById('packageDeleteModal').style.display = 'none';
      adminClosePackageModal();
      initAdmin();
    } else {
      alert('エラー: ' + res.error);
    }
  } catch(e) {
    alert('通信エラー: ' + e.message);
  }
}
window.adminClosePackageDeleteModal = () => document.getElementById('packageDeleteModal').style.display = 'none';


// =========================================================
// 6. レッスン枠 (Slot) 管理
// =========================================================

// ★追加: 過去日判定ヘルパー
function isPastDate(dateStr) {
  const today = new Date();
  today.setHours(0,0,0,0);
  const target = new Date(dateStr);
  return target < today;
}

function adminOpenPackageSelectModal() {
  if (!adminState.selectedDate) {
    return showToast('まずは日付を選択してください');
  }
  // ★追加: 過去日の登録禁止
  if (isPastDate(adminState.selectedDate)) {
    return showToast('過去の日付には登録できません');
  }

  const modal = document.getElementById('packageSelectModal');
  const list = document.getElementById('packageSelectList');
  list.innerHTML = '';

  const manualBtn = document.createElement('div');
  manualBtn.className = 'package-card';
  manualBtn.style.textAlign = 'center';
  manualBtn.style.background = '#f0f0f0';
  manualBtn.innerHTML = '<strong>＋ 完全手動で入力</strong>';
  manualBtn.onclick = () => {
    adminClosePackageSelectModal();
    openSlotModalForNew(null);
  };
  list.appendChild(manualBtn);

  adminState.packages.filter(p => getVal(p, ['status', '状態']) !== '削除').forEach(pkg => {
    const el = document.createElement('div');
    el.className = 'package-card';
    el.style.borderLeft = `4px solid ${L.getColor(pkg)}`;
    el.innerHTML = `<div class="package-card-title">${L.getName(pkg)}</div><div style="font-size:0.8em;">${L.getTeacher(pkg)}</div>`;
    el.onclick = () => {
      adminClosePackageSelectModal();
      openSlotModalForNew(pkg);
    };
    list.appendChild(el);
  });

  modal.style.display = 'flex';
}
window.adminClosePackageSelectModal = () => document.getElementById('packageSelectModal').style.display = 'none';

function openSlotModalForNew(pkg) {
  document.getElementById('slotId').value = '';
  document.getElementById('slotModalTitle').textContent = 'レッスン枠 追加';
  document.getElementById('slotDateLabel').textContent = adminState.selectedDate;
  document.getElementById('slotGuestSection').style.display = 'none';
  document.getElementById('slotDeleteBtn').style.display = 'none';
  document.getElementById('priceLockMsg').style.display = 'none';
  document.getElementById('slotPrice').disabled = false;

  const pkgArea = document.getElementById('slotPackageArea');
  const manualArea = document.getElementById('slotManualInputArea');
  const manualInput = document.getElementById('slotManualName');
  // ★追加: 先生名エリア・入力欄
  const manualTeacherArea = document.getElementById('slotManualTeacherArea');
  const manualTeacherInput = document.getElementById('slotManualTeacher');

  if (pkg) {
    // パッケージ利用
    pkgArea.style.display = 'block';
    manualArea.style.display = 'none';
    manualTeacherArea.style.display = 'none'; // ★追加: 隠す
    
    pkgArea.textContent = `雛形: ${L.getName(pkg)} (${L.getTeacher(pkg)})`;
    adminState.tempPkg = pkg;
    
    document.getElementById('slotStartTime').value = '10:00';
    document.getElementById('slotEndTime').value = '11:00';
    document.getElementById('slotPrice').value = L.getPrice(pkg);
    document.getElementById('slotCapacity').value = L.getCapacity(pkg);
    document.getElementById('slotIsPublic').checked = L.getPublic(pkg);
    setupColorPicker('slotColorPalette', 'slotColor', L.getColor(pkg));
  } else {
    // 手動入力
    adminState.tempPkg = null;
    pkgArea.style.display = 'none';
    manualArea.style.display = 'block';
    manualTeacherArea.style.display = 'block'; // ★追加: 表示
    
    // ★修正: 空白にして入力を強制
    manualInput.value = '';
    manualTeacherInput.value = ''; // ★追加: 初期化
    
    document.getElementById('slotStartTime').value = ''; // 空白
    document.getElementById('slotEndTime').value = '';   // 空白
    document.getElementById('slotPrice').value = '';     // 空白
    document.getElementById('slotCapacity').value = '';  // 空白
    document.getElementById('slotIsPublic').checked = true;
    setupColorPicker('slotColorPalette', 'slotColor', CONSTANTS.COLORS[0]); // デフォルト白
  }

  document.getElementById('slotSaveBtn').onclick = saveSlot;
  document.getElementById('slotModal').style.display = 'flex';
}

window.adminOpenSlotModal = function(slotId) {
  const lesson = adminState.lessons.find(l => String(L.getId(l)) === String(slotId));
  if (!lesson) return;
  adminState.tempPkg = null;

  document.getElementById('slotId').value = slotId;
  document.getElementById('slotModalTitle').textContent = 'レッスン枠 編集';
  document.getElementById('slotDateLabel').textContent = L.getDate(lesson);
  
  // 編集時は常にパッケージ名表示エリアを使用 (UI整合性のため)
  const pkgArea = document.getElementById('slotPackageArea');
  const manualArea = document.getElementById('slotManualInputArea');
  // ★追加
  const manualTeacherArea = document.getElementById('slotManualTeacherArea');
  
  pkgArea.style.display = 'block';
  manualArea.style.display = 'none';
  manualTeacherArea.style.display = 'none'; // ★追加: 隠す
  
  pkgArea.textContent = `${L.getName(lesson)} (${L.getTeacher(lesson)})`;
  
  document.getElementById('slotStartTime').value = L.getStart(lesson);
  document.getElementById('slotEndTime').value = L.getEnd(lesson);
  document.getElementById('slotPrice').value = L.getPrice(lesson);
  document.getElementById('slotCapacity').value = L.getCapacity(lesson);
  
  // チェックボックス設定
  document.getElementById('slotIsPublic').checked = L.getPublic(lesson);
  
  const color = L.getColor(lesson);
  setupColorPicker('slotColorPalette', 'slotColor', color);

  // 予約がある場合、価格変更ロック & 削除禁止制御
  const guests = lesson.guests || [];
  const hasRes = guests.some(g => {
    const s = G.getStatus(g);
    return s === '予約' || s === 'キャンセル待ち';
  });
  
  if (hasRes) {
    document.getElementById('slotPrice').disabled = true;
    document.getElementById('priceLockMsg').style.display = 'inline';
  } else {
    document.getElementById('slotPrice').disabled = false;
    document.getElementById('priceLockMsg').style.display = 'none';
  }

  const delBtn = document.getElementById('slotDeleteBtn');
  delBtn.style.display = 'block';
  
  // ★予約者がいる場合は削除ボタンを非活性化
  if (hasRes) {
    delBtn.disabled = true;
    delBtn.style.opacity = '0.5';
    delBtn.onclick = null;
    document.getElementById('slotDeleteConfirmMessage').textContent = "予約者がいるため削除できません。先にすべての予約を強制キャンセルしてください。";
  } else {
    delBtn.disabled = false;
    delBtn.style.opacity = '1';
    delBtn.onclick = () => {
      document.getElementById('slotDeleteConfirmMessage').textContent = "このレッスン枠を削除しますか？";
      document.getElementById('slotDeleteModal').style.display = 'flex';
      document.getElementById('slotDeleteConfirmBtn').onclick = () => deleteSlot(slotId);
    };
  }

  renderGuestList(guests);

  document.getElementById('slotSaveBtn').onclick = saveSlot;
  document.getElementById('slotModal').style.display = 'flex';
};

window.adminCloseSlotModal = () => document.getElementById('slotModal').style.display = 'none';
window.adminCloseSlotDeleteModal = () => document.getElementById('slotDeleteModal').style.display = 'none';

function renderGuestList(guests) {
  const section = document.getElementById('slotGuestSection');
  const ul = document.getElementById('slotGuestList');
  ul.innerHTML = '';
  section.style.display = 'block';

  if (!guests || guests.length === 0) {
    ul.innerHTML = '<li class="empty-text" style="font-size:18px;">予約者はまだいません</li>';
    return;
  }

  guests.forEach(g => {
    const status = G.getStatus(g);
    if (status === 'キャンセル') return;

    const li = document.createElement('li');
    li.className = 'guest-item';
    
    let statusBadge = '';
    if (status === 'キャンセル待ち') {
      statusBadge = '<span style="background:#ff9800; color:#fff; padding:2px 6px; border-radius:4px; font-size:0.8em; margin-right:8px;">待ち</span>';
    } else {
      statusBadge = '<span style="background:#4caf50; color:#fff; padding:2px 6px; border-radius:4px; font-size:0.8em; margin-right:8px;">予約</span>';
    }

    const gName = G.getName(g) || '不明';
    const gPhone = G.getPhone(g) || '--';

    li.innerHTML = `
      <div style="display:flex; align-items:center;">
        ${statusBadge}
        <strong>${gName}</strong>
        <span style="font-size:0.8em; color:#888; margin-left:8px;">(${gPhone})</span>
      </div>
    `;

    const btnArea = document.createElement('div');
    const cancelBtn = document.createElement('button');
    cancelBtn.innerHTML = '🗑️'; // ゴミ箱アイコン
    cancelBtn.className = 'btn-icon-danger'; // style.cssで定義済み
    cancelBtn.onclick = (e) => {
      e.stopPropagation();
      confirmForceCancel(g);
    };
    
    btnArea.appendChild(cancelBtn);
    li.appendChild(btnArea);

    li.onclick = () => openGuestDetail(g);

    ul.appendChild(li);
  });
}

/**
 * 枠情報の保存
 * ★手動入力時のバリデーションは既存ロジック(lessonNameチェック)で担保済み
 */
async function saveSlot() {
  const slotId = document.getElementById('slotId').value;
  
  // 新規作成時のみ過去日チェック
  if (!slotId && isPastDate(adminState.selectedDate)) {
    return alert('過去の日付には登録できません');
  }

  let payload = {
    slotId: slotId,
    date: document.getElementById('slotDateLabel').textContent,
    startTime: document.getElementById('slotStartTime').value,
    endTime: document.getElementById('slotEndTime').value,
    price: Number(document.getElementById('slotPrice').value),
    capacity: Number(document.getElementById('slotCapacity').value),
    color: document.getElementById('slotColor').value,
    isPublic: document.getElementById('slotIsPublic').checked ? 1 : 0
  };

  // バリデーション: 時間は必須
  if (!payload.startTime || !payload.endTime) {
    return alert('時間を入力してください');
  }

  // 名前等の設定
  if (!slotId) {
    // ■ 新規作成
    payload.date = adminState.selectedDate;
    if (adminState.tempPkg) {
      // パッケージから
      payload.lessonName = L.getName(adminState.tempPkg);
      payload.teacherName = L.getTeacher(adminState.tempPkg);
      payload.description = L.getDesc(adminState.tempPkg);
      payload.packageId = L.getId(adminState.tempPkg);
    } else {
      // 手動入力 (入力欄から取得)
      payload.lessonName = document.getElementById('slotManualName').value.trim();
      if (!payload.lessonName) return alert('レッスン名を入力してください');
      
      // ★修正: 先生名の手動入力を取得
      payload.teacherName = document.getElementById('slotManualTeacher').value.trim();
      
      payload.description = "";
    }
  } else {
    // ■ 既存更新
    // 既存のレッスン情報を取得して名前を保持する (編集画面には名前入力欄がないため)
    const existingLesson = adminState.lessons.find(l => String(L.getId(l)) === String(slotId));
    if (existingLesson) {
      payload.lessonName = L.getName(existingLesson);
      payload.teacherName = L.getTeacher(existingLesson);
      payload.description = L.getDesc(existingLesson);
      payload.packageId = getVal(existingLesson, ['packageId', 'パッケージID']);
    }
  }

  try {
    const res = await gas('apiSaveSlot', payload); 
    if (res.success) {
      showToast('レッスン枠を保存しました');
      adminCloseSlotModal();
      initAdmin();
    } else {
      alert('エラー: ' + res.error);
    }
  } catch(e) {
    alert('通信エラー: ' + e.message);
  }
}

async function deleteSlot(id) {
  try {
    const res = await gas('apiSaveSlot', { slotId: id, status: '削除' });
    if (res.success) {
      showToast('レッスン枠を削除しました');
      adminCloseSlotDeleteModal();
      adminCloseSlotModal();
      initAdmin();
    } else {
      alert('エラー: ' + res.error);
    }
  } catch(e) {
    alert('通信エラー: ' + e.message);
  }
}

// =========================================================
// 7. 強制キャンセル
// =========================================================

function confirmForceCancel(guest) {
  const modal = document.getElementById('forceCancelModal');
  const msg = document.getElementById('forceCancelMessage');
  const btn = document.getElementById('btnExecForceCancel');
  
  msg.textContent = `${G.getName(guest)} 様の予約を強制的に取り消しますか？`;
  btn.onclick = () => execForceCancel(guest);
  modal.style.display = 'flex';
}

async function execForceCancel(guest) {
  document.getElementById('forceCancelModal').style.display = 'none';
  const targetId = G.getId(guest);
  if (!targetId) return alert('予約IDが不明です');

  try {
    const res = await gas('apiAdminForceCancel', { id: targetId });
    if (res.success) {
      // ★修正: モーダルで完了を表示
      openCustomAlert('キャンセル処理が完了しました。\nキャンセル待ちの繰り上げがあれば自動処理されました。');
      adminCloseSlotModal();
      initAdmin();
    } else {
      alert('エラー: ' + res.error);
    }
  } catch(e) {
    alert('通信エラー: ' + e.message);
  }
}

// =========================================================
// 8. 顧客詳細 & 設定 & ヘルプ
// =========================================================

function openGuestDetail(g) {
  const m = document.getElementById('guestDetailModal');
  const gName = G.getName(g);
  const gPhone = G.getPhone(g);
  const gEmail = G.getEmail(g);
  
  document.getElementById('guestName').value = gName;
  document.getElementById('guestPhone').value = gPhone;
  document.getElementById('guestEmail').value = gEmail;
  
  document.getElementById('guestEmail').onclick = () => {
    if(gEmail) location.href = 'mailto:' + gEmail;
  };

  const custId = G.getCustId(g);
  const custData = adminState.customers.find(c => {
    return String(getVal(c, ['customerId', '顧客ID'])) === String(custId);
  }) || {};
  
  document.getElementById('guestVisitCount').value = (getVal(custData, ['visitCount', '来店回数']) || 0) + '回';
  document.getElementById('guestCustomerId').value = custId || '-';
  document.getElementById('guestMemo').value = getVal(custData, ['memo', '備考']) || '';
  
  document.getElementById('btnGuestHistoryFromDetail').onclick = () => {
    m.style.display = 'none';
    if(gEmail) showCustomerHistoryByEmail(gEmail, gName);
  };

  m.style.display = 'flex';
}
window.adminCloseGuestDetailModal = () => document.getElementById('guestDetailModal').style.display = 'none';

/**
 * 顧客履歴表示
 */
function showCustomerHistoryByEmail(email, name) {
  const m = document.getElementById('customerHistoryModal');
  document.getElementById('historyCustomerName').textContent = name + ' 様';
  const ul = document.getElementById('customerHistoryUL');
  ul.innerHTML = '';
  
  const history = [];
  adminState.lessons.forEach(l => {
    const guests = l.guests || [];
    const myRes = guests.find(g => G.getEmail(g) === email);
    if(myRes) {
      // 日付と時間を両方取得
      history.push({ 
        date: L.getDate(l), 
        time: formatTimeShort(L.getStart(l)), // 時間取得
        lesson: L.getName(l), 
        status: G.getStatus(myRes) 
      });
    }
  });
  
  // 日付順(降順)
  history.sort((a,b) => {
    if(a.date !== b.date) return (a.date < b.date ? 1 : -1);
    return (a.time < b.time ? 1 : -1);
  });

  if(history.length === 0) {
    ul.innerHTML = '<li class="guest-item">履歴なし</li>';
  } else {
    history.forEach(h => {
      const li = document.createElement('li');
      li.className = 'guest-item';
      li.style.fontSize = '20px';
      // UI表示: 日付 時間 レッスン名 状態
      li.innerHTML = `<span>${h.date} ${h.time} ${h.lesson}</span><span>${h.status}</span>`;
      ul.appendChild(li);
    });
  }
  m.style.display = 'flex';
}
window.adminCloseCustomerHistory = () => document.getElementById('customerHistoryModal').style.display = 'none';

// --- 顧客一覧 ---
window.adminOpenCustomerList = function() {
  const m = document.getElementById('customerListModal');
  const ul = document.getElementById('customerListUL');
  const input = document.getElementById('customerSearchInput');
  ul.innerHTML = '';
  m.style.display = 'flex';
  
  const renderList = (filter = '') => {
    ul.innerHTML = '';
    const list = adminState.customers.filter(c => {
      const name = getVal(c, ['name', '氏名']);
      const phone = getVal(c, ['phone', '電話', '電話番号']);
      if(!filter) return true;
      return (name && name.includes(filter)) || (phone && phone.includes(filter));
    });
    
    if(list.length === 0) {
      document.getElementById('customerListMsg').style.display = 'block';
    } else {
      document.getElementById('customerListMsg').style.display = 'none';
      list.forEach(c => {
        const li = document.createElement('li');
        li.className = 'guest-item';
        const name = getVal(c, ['name', '氏名']);
        const count = getVal(c, ['visitCount', '来店回数']) || 0;
        li.innerHTML = `<strong>${name}</strong><span>${count}回</span>`;
        li.onclick = () => {
          openGuestDetail(c);
        };
        ul.appendChild(li);
      });
    }
  };
  
  renderList();
  input.oninput = (e) => renderList(e.target.value);
};
window.adminCloseCustomerList = () => document.getElementById('customerListModal').style.display = 'none';

// --- スタジオ設定 ---
window.adminOpenSettings = function() {
  const s = adminState.settings || {};
  document.getElementById('setStudioName').value = getVal(s, ['studioName', 'スタジオ名']);
  document.getElementById('setConcept').value = getVal(s, ['concept', '紹介文']);
  document.getElementById('setAddress').value = getVal(s, ['address', '住所']);
  document.getElementById('setContactEmail').value = getVal(s, ['contactEmail', 'お問い合わせメール']);
  document.getElementById('setFacilities').value = getVal(s, ['facilities', '設備・サービス']);
  
  document.getElementById('settingsModal').style.display = 'flex';
};

window.adminSaveSettings = async function() {
  const payload = {
    studioName: document.getElementById('setStudioName').value,
    concept: document.getElementById('setConcept').value,
    address: document.getElementById('setAddress').value,
    contactEmail: document.getElementById('setContactEmail').value,
    facilities: document.getElementById('setFacilities').value
  };
  
  try {
    const res = await gas('apiSaveSettings', payload);
    if (res.success) {
      showToast('設定を保存しました');
      document.getElementById('settingsModal').style.display = 'none';
      initAdmin();
    } else {
      alert('保存できませんでした: ' + (res.error || ''));
    }
  } catch(e) {
    alert('通信エラー');
  }
};
window.adminCloseSettings = () => document.getElementById('settingsModal').style.display = 'none';

// =========================================================
// ★詳細マニュアルの実装 (ここを大幅強化)
// =========================================================
window.adminOpenHelp = function() {
  const m = document.getElementById('helpModal');
  const bd = m.querySelector('.modal-bd');
  
  // 見やすく整理されたHTMLコンテンツ
  bd.innerHTML = `
    <div style="text-align: left; padding: 0 10px;">
      
      <div class="help-section">
        <div class="help-heading">1. 管理画面の基本操作</div>
        <div class="help-item">
          <h4>カレンダーの見方</h4>
          <p>
            各レッスン枠には「予約数 / 定員 (キャンセル待ち数)」が表示されます。<br>
            例：<strong>予約: 3/8 (待: 1)</strong><br>
            ※キャンセル待ちが1名以上いる場合、文字が<span style="color:#c62828; font-weight:bold;">赤色</span>で強調表示されます。
          </p>
        </div>
        <div class="help-item">
          <h4>レッスンの登録・編集</h4>
          <p>
            <strong>新規登録：</strong> 日付をタップして「パッケージから作成」または「完全手動入力」を選びます。<br>
            <strong>編集：</strong> 登録済みのレッスン枠をタップすると詳細画面が開きます。<br>
            <strong>削除制限：</strong> 予約が入っているレッスンは誤操作防止のため削除ボタンが押せません。先に予約者を強制キャンセルしてください。
          </p>
        </div>
      </div>

      <div class="help-section">
        <div class="help-heading">2. ユーザー操作とシステムの動き</div>
        <div class="help-item">
          <h4>予約確定の流れ</h4>
          <p>
            ユーザーがWebサイトから予約を行うと、即座に<strong>「予約確定メール」</strong>が自動送信されます。<br>
            管理画面の予約数もリアルタイムで更新されます。
          </p>
        </div>
        <div class="help-item">
          <h4>キャンセル待ちと自動繰り上げ</h4>
          <p>
            定員に達したレッスンには「キャンセル待ち」として登録されます。<br>
            もし空きが出た場合、システムは以下の条件で自動処理を行います。<br>
            <br>
            <strong>条件：レッスン開始の24時間前まで</strong><br>
            この期限内であれば、キャンセル待ちの1番目の人が自動的に「予約確定」に昇格し、<strong>「繰り上げ当選メール」</strong>が送信されます。<br>
            ※24時間を切っている場合は自動処理されませんので、必要に応じて管理者が電話等で連絡してください。
          </p>
        </div>
        <div class="help-item">
          <h4>ユーザーによるキャンセル</h4>
          <p>
            ユーザーはメール内のリンクから予約をキャンセルできます。<br>
            キャンセルされると、その枠は即座に解放され、自動繰り上げ等の処理が走ります。
          </p>
        </div>
      </div>

      <div class="help-section">
        <div class="help-heading">3. 自動リマインダー</div>
        <div class="help-item">
          <h4>前日確認メール</h4>
          <p>
            毎朝10時頃に、<strong>「翌日に予約が入っているお客様」</strong>に対して、リマインドメールが一斉送信されます。<br>
            このメールには日時・場所のほか、キャンセル用URLも記載されています。
          </p>
        </div>
      </div>

      <div class="help-section">
        <div class="help-heading">4. 管理者による強制操作</div>
        <div class="help-item">
          <h4>強制キャンセル</h4>
          <p>
            レッスン枠詳細の予約者リストにある「ゴミ箱アイコン🗑️」を押すと、強制キャンセルが可能です。<br>
            実行すると、お客様へ<strong>「管理者都合によるキャンセル通知」</strong>メールが送信されます。<br>
            また、この操作によって空きが出た場合も、自動繰り上げ機能が作動します。
          </p>
        </div>
      </div>

    </div>
  `;
  m.style.display = 'flex';
};

// =========================================================
// 9. ユーティリティ
// =========================================================

function setupColorPicker(containerId, inputId, defaultColor) {
  const container = document.getElementById(containerId);
  const input = document.getElementById(inputId);
  if(!container || !input) return;

  container.innerHTML = '';
  CONSTANTS.COLORS.forEach(c => {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = c;
    
    // 白の場合は枠線をつけておく (style.cssにも追加推奨だが念のためJSでも)
    if (c.toLowerCase() === '#ffffff') {
      swatch.style.border = '1px solid #ddd';
    }

    // 初期選択
    const isSelected = (defaultColor && c.toLowerCase() === defaultColor.toLowerCase()) || 
                       (!defaultColor && c === CONSTANTS.COLORS[0]);
    if (isSelected) {
      swatch.classList.add('selected');
      input.value = c;
    }

    swatch.onclick = () => {
      Array.from(container.children).forEach(child => child.classList.remove('selected'));
      swatch.classList.add('selected');
      input.value = c;
    };
    container.appendChild(swatch);
  });
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = ('0' + (d.getMonth() + 1)).slice(-2);
  const day = ('0' + d.getDate()).slice(-2);
  return `${y}-${m}-${day}`;
}

function formatTimeShort(timeStr) {
  if (!timeStr) return '';
  if (timeStr instanceof Date) {
    const h = ('0' + timeStr.getHours()).slice(-2);
    const m = ('0' + timeStr.getMinutes()).slice(-2);
    return `${h}:${m}`;
  }
  return String(timeStr).substring(0, 5);
}

function isLightColor(hex) {
  if (!hex) return true;
  if (hex.startsWith('#')) hex = hex.slice(1);
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 155;
}