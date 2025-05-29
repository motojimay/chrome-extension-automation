// CDP操作のメインクラス
class KakakuAutomation {
  constructor(tabId) {
    this.tabId = tabId;
    this.debuggeeId = { tabId: tabId };
  }

  // デバッガーをアタッチ
  async attach() {
    return new Promise((resolve, reject) => {
      chrome.debugger.attach(this.debuggeeId, '1.3', () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          // デバッグバーを非表示にする
          this.hideDebuggerBar();
          resolve();
        }
      });
    });
  }

  // デバッグバーを非表示にする
  async hideDebuggerBar() {
    try {
      // CSS経由でデバッグバーを非表示
      await this.sendCommand('Runtime.evaluate', {
        expression: `
          // デバッグバーのスタイルを非表示に設定
          const style = document.createElement('style');
          style.innerHTML = \`
            [data-devtools-theme] {
              display: none !important;
            }
            /* Chrome のデバッグバーを非表示 */
            body > div[style*="background-color: rgb(255, 249, 196)"] {
              display: none !important;
            }
            /* その他のデバッグ関連要素 */
            div[style*="position: fixed"][style*="top: 0px"][style*="left: 0px"][style*="right: 0px"] {
              display: none !important;
            }
          \`;
          document.head.appendChild(style);
          
          // 既存のデバッグバーを削除
          const debugBars = document.querySelectorAll('div[style*="background-color: rgb(255, 249, 196)"]');
          debugBars.forEach(bar => bar.remove());
          
          // MutationObserverで動的に追加されるデバッグバーも監視
          const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
              mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1 && node.style && 
                    node.style.backgroundColor === 'rgb(255, 249, 196)') {
                  node.style.display = 'none';
                }
              });
            });
          });
          observer.observe(document.body, { childList: true, subtree: true });
          
          console.log('Debug bar hidden successfully');
          true;
        `
      });

      // Page.addScriptToEvaluateOnNewDocumentでページ読み込み時にも適用
      await this.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
        source: `
          // ページ読み込み時にデバッグバーを非表示
          (function() {
            const hideDebugBar = () => {
              const style = document.createElement('style');
              style.innerHTML = \`
                [data-devtools-theme] {
                  display: none !important;
                }
                body > div[style*="background-color: rgb(255, 249, 196)"] {
                  display: none !important;
                }
                div[style*="position: fixed"][style*="top: 0px"][style*="left: 0px"][style*="right: 0px"] {
                  display: none !important;
                }
              \`;
              document.head.appendChild(style);
              
              // 既存のデバッグバーを削除
              const debugBars = document.querySelectorAll('div[style*="background-color: rgb(255, 249, 196)"]');
              debugBars.forEach(bar => bar.remove());
            };
            
            if (document.readyState === 'loading') {
              document.addEventListener('DOMContentLoaded', hideDebugBar);
            } else {
              hideDebugBar();
            }
            
            // 定期的にチェック
            setInterval(hideDebugBar, 500);
          })();
        `
      });

    } catch (error) {
      console.log('デバッグバーの非表示処理でエラー:', error);
    }
  }

  // デバッガーをデタッチ
  async detach() {
    return new Promise((resolve) => {
      chrome.debugger.detach(this.debuggeeId, () => {
        resolve();
      });
    });
  }

  // CDPコマンドを送信
  async sendCommand(method, params = {}) {
    return new Promise((resolve, reject) => {
      chrome.debugger.sendCommand(this.debuggeeId, method, params, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });
  }

  // 要素が表示されるまで待機
  async waitForSelector(selector, timeout = 30000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      try {
        const result = await this.sendCommand('Runtime.evaluate', {
          expression: `document.querySelector('${selector}') !== null`
        });
        if (result.result.value) {
          return true;
        }
      } catch (error) {
        console.log('Waiting for selector:', selector);
      }
      await this.sleep(500);
    }
    throw new Error(`Selector ${selector} not found within ${timeout}ms`);
  }

  // ナビゲーション完了まで待機
  async waitForNavigation(timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Navigation timeout'));
      }, timeout);

      const handleEvent = (debuggeeId, message, params) => {
        if (debuggeeId.tabId === this.tabId && message === 'Page.loadEventFired') {
          chrome.debugger.onEvent.removeListener(handleEvent);
          clearTimeout(timeoutId);
          resolve();
        }
      };

      chrome.debugger.onEvent.addListener(handleEvent);
    });
  }

  // 指定時間待機
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ページを開く
  async goto(url) {
    await this.sendCommand('Page.enable');
    await this.sendCommand('Page.navigate', { url: url });
    await this.waitForNavigation();
  }

  // 要素をクリック
  async click(selector) {
    await this.waitForSelector(selector);
    
    // 要素の位置を取得
    const result = await this.sendCommand('Runtime.evaluate', {
      expression: `
        const element = document.querySelector('${selector}');
        if (element) {
          const rect = element.getBoundingClientRect();
          JSON.stringify({
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            width: rect.width,
            height: rect.height
          });
        } else {
          null;
        }
      `
    });

    if (result.result.value) {
      const position = JSON.parse(result.result.value);
      
      await this.sendCommand('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: position.x,
        y: position.y,
        button: 'left',
        clickCount: 1
      });

      await this.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: position.x,
        y: position.y,
        button: 'left',
        clickCount: 1
      });
    }
  }

  // フォームを直接サブミット
  async submitForm(formSelector) {
    await this.sendCommand('Runtime.evaluate', {
      expression: `
        const form = document.querySelector('${formSelector}');
        if (form) {
          form.submit();
          true;
        } else {
          false;
        }
      `
    });
  }

  // JavaScript経由でクリックイベントを発火
  async clickWithJS(selector) {
    await this.waitForSelector(selector);
    return await this.sendCommand('Runtime.evaluate', {
      expression: `
        const element = document.querySelector('${selector}');
        if (element) {
          element.click();
          true;
        } else {
          false;
        }
      `
    });
  }

  // テキストを入力
  async type(selector, text) {
    await this.waitForSelector(selector);
    
    // フォームフィールドにフォーカス
    await this.click(selector);
    
    // 既存のテキストをクリア
    await this.sendCommand('Runtime.evaluate', {
      expression: `
        const element = document.querySelector('${selector}');
        if (element) {
          element.value = '';
          element.focus();
        }
      `
    });

    // 文字を一つずつ入力
    for (const char of text) {
      await this.sendCommand('Input.insertText', { text: char });
      await this.sleep(50);
    }
  }

  // Enterキーを押す
  async pressEnter() {
    await this.sendCommand('Input.dispatchKeyEvent', {
      type: 'keyDown',
      code: 'Enter',
      key: 'Enter'
    });
    await this.sendCommand('Input.dispatchKeyEvent', {
      type: 'keyUp',
      code: 'Enter',
      key: 'Enter'
    });
  }

  // JavaScript式を評価
  async evaluate(expression) {
    const result = await this.sendCommand('Runtime.evaluate', {
      expression: expression
    });
    return result.result.value;
  }

  // メインの検索実行
  async runSearch(keyword) {
    console.log('🚀 検索開始:', keyword);

    // 価格.comに移動
    console.log('📄 価格.comを開いています...');
    await this.goto('https://kakaku.com/');
    await this.sleep(2000);

    // 検索キーワードを入力
    console.log('🔍 検索キーワードを入力...');
    await this.type('#query', keyword);
    await this.sleep(1000);

    // 検索ボタンをクリックして検索実行（複数の方法を試行）
    console.log('⏳ 検索実行中...');
    
    try {
      // 方法1: JavaScriptでクリックイベントを発火
      console.log('方法1: JavaScriptクリックを試行...');
      const clickResult = await this.clickWithJS('#main_search_button');
      if (clickResult.result.value) {
        console.log('✅ JavaScriptクリック成功');
      } else {
        throw new Error('JavaScriptクリック失敗');
      }
    } catch (error) {
      console.log('方法1失敗、方法2を試行:', error.message);
      
      try {
        // 方法2: フォームを直接サブミット
        console.log('方法2: フォームサブミットを試行...');
        await this.submitForm('#FrmKeyword');
        console.log('✅ フォームサブミット成功');
      } catch (error2) {
        console.log('方法2失敗、方法3を試行:', error2.message);
        
        // 方法3: 物理的なマウスクリック
        console.log('方法3: 物理クリックを試行...');
        await this.click('#main_search_button');
        console.log('✅ 物理クリック完了');
      }
    }
    
    await this.waitForNavigation();
    await this.sleep(3000);

    // 並び替えプルダウンをクリック
    console.log('📊 並び替えオプションを開いています...');
    await this.waitForSelector('#am-sort .p-pullDown_ttl');
    await this.click('#am-sort .p-pullDown_ttl');
    await this.sleep(2000);

    // 「価格の安い順」を選択
    console.log('💰 価格の安い順を選択...');
    const priceOrderFound = await this.evaluate(`
      const listItems = document.querySelectorAll('#am-sort .p-pullDown_list li');
      let found = false;
      for (const item of listItems) {
        if (item.textContent.trim().includes('価格の安い順')) {
          item.click();
          found = true;
          break;
        }
      }
      found;
    `);

    if (!priceOrderFound) {
      throw new Error('価格の安い順が見つかりませんでした');
    }

    await this.sleep(2000);
    await this.waitForNavigation();
    await this.sleep(3000);

    // ショップリンクをクリック
    console.log('🏪 ショップページに移動...');
    await this.waitForSelector('a.p-resultItem_btnLink');
    
    const shopLinkFound = await this.evaluate(`
      const shopLink = document.querySelector('a.p-resultItem_btnLink');
      if (shopLink) {
        shopLink.removeAttribute('target');
        shopLink.click();
        true;
      } else {
        false;
      }
    `);

    if (!shopLinkFound) {
      throw new Error('ショップリンクが見つかりませんでした');
    }

    await this.waitForNavigation();
    await this.sleep(2000);

    console.log('✅ 検索完了！ショップページに遷移しました');
  }
}

// メッセージリスナー
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startSearch') {
    const automation = new KakakuAutomation(request.tabId);
    
    (async () => {
      try {
        await automation.attach();
        await automation.runSearch(request.keyword);
        await automation.detach();
        sendResponse({ success: true });
      } catch (error) {
        console.error('検索エラー:', error);
        await automation.detach();
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true; // 非同期レスポンスを示す
  }
});
