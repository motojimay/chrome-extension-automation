document.addEventListener('DOMContentLoaded', function() {
  const keywordInput = document.getElementById('keyword');
  const startButton = document.getElementById('startButton');
  const statusDiv = document.getElementById('status');

  function showStatus(message, type = 'info') {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';
  }

  startButton.addEventListener('click', async function() {
    const keyword = keywordInput.value.trim();
    if (!keyword) {
      showStatus('検索キーワードを入力してください', 'error');
      return;
    }

    startButton.disabled = true;
    showStatus('検索を開始しています...', 'info');

    try {
      // 現在のタブを取得
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // background scriptに検索開始を通知
      chrome.runtime.sendMessage({
        action: 'startSearch',
        keyword: keyword,
        tabId: tab.id
      }, (response) => {
        if (response.success) {
          showStatus('検索が完了しました！', 'success');
        } else {
          showStatus(`エラー: ${response.error}`, 'error');
        }
        startButton.disabled = false;
      });

    } catch (error) {
      console.error('Error:', error);
      showStatus(`エラーが発生しました: ${error.message}`, 'error');
      startButton.disabled = false;
    }
  });
});