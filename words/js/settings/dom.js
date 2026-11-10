/**
 * 设置模块：设置面板 DOM 模板与类别导航。
 * 只负责构建与操作设置界面结构，不承载状态与网络逻辑。
 */
;(function () {
  const ns = (window.A4SettingsInternal = window.A4SettingsInternal || {})

  function installSettingsCategoryNavigation({ tabs, panels, scrollContainer, tablist, indicator } = {}) {
    const tabList = Array.from(tabs || [])
    const panelList = Array.from(panels || [])
    const panelById = new Map(panelList.map((panel) => [panel.id, panel]))
    const motionClasses = [
      "settings-panel-enter-initial",
      "settings-panel-enter-forward",
      "settings-panel-enter-back",
    ]
    const navigationKeys = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"])
    let activeIndex = -1

    function refreshIndicator() {
      if (!indicator || !tablist || activeIndex < 0) {
        tablist?.classList.remove("is-indicator-ready")
        return
      }
      tablist.style.setProperty("--settings-tab-index", String(activeIndex))
      tablist.classList.add("is-indicator-ready")
    }

    function activate(tabOrIndex, { focus = false, resetScroll = true } = {}) {
      const index = typeof tabOrIndex === "number" ? tabOrIndex : tabList.indexOf(tabOrIndex)
      if (index < 0 || index >= tabList.length) return
      const previousIndex = activeIndex
      const activeTab = tabList[index]
      const activePanel = panelById.get(activeTab.getAttribute("aria-controls"))

      for (const tab of tabList) {
        const selected = tab === activeTab
        tab.setAttribute("aria-selected", selected ? "true" : "false")
        tab.tabIndex = selected ? 0 : -1
      }
      for (const panel of panelList) {
        panel.classList.remove(...motionClasses)
        panel.hidden = panel !== activePanel
      }

      activeIndex = index
      if (activePanel && index !== previousIndex) {
        const motionClass = previousIndex < 0
          ? "settings-panel-enter-initial"
          : index > previousIndex
            ? "settings-panel-enter-forward"
            : "settings-panel-enter-back"
        activePanel.classList.add(motionClass)
      }
      refreshIndicator()
      if (resetScroll && scrollContainer) scrollContainer.scrollTop = 0
      if (focus) activeTab.focus()
    }

    function getNextIndex(index, key) {
      const lastIndex = tabList.length - 1
      if (key === "Home") return 0
      if (key === "End") return lastIndex
      if (key === "ArrowRight" || key === "ArrowDown") return (index + 1) % tabList.length
      return (index - 1 + tabList.length) % tabList.length
    }

    tabList.forEach((tab, index) => {
      tab.addEventListener("click", () => activate(index))
      tab.addEventListener("keydown", (event) => {
        if (!navigationKeys.has(event.key) || !tabList.length) return
        event.preventDefault()
        activate(getNextIndex(index, event.key), { focus: true })
      })
    })

    const glass = window.A4DockGlass?.attachSlider?.({
      nav: tablist,
      itemSelector: ".settings-category-tab",
      getIndex: () => Math.max(0, activeIndex),
      onCommit: (index) => activate(index),
    })

    return { activate, refreshIndicator, detach: () => glass?.detach?.() }
  }

  function setSwitchChecked(button, checked) {
    if (!button) return
    button.setAttribute("aria-checked", checked ? "true" : "false")
  }

  const DAILY_GOAL_WORD_CHOICES = Object.freeze([0, 10, 20, 30, 40, 50, 75, 100, 150, 200, 250, 300, 400, 500])

  function rangeInclusive(min, max) {
    const values = []
    for (let value = min; value <= max; value += 1) values.push(value)
    return values
  }

  function numericSelectOptions(values) {
    return values.map((value) => `<option value="${value}">${value}</option>`).join("")
  }

  function fillNumericSelect(select, values, current) {
    if (!select) return
    const next = Number(current)
    const list = values.slice()
    if (Number.isFinite(next) && !list.includes(next)) {
      list.push(next)
      list.sort((a, b) => a - b)
    }
    const html = numericSelectOptions(list)
    if (select.innerHTML !== html) select.innerHTML = html
    select.value = String(Number.isFinite(next) ? next : list[0])
  }

  function configureSettingsPresentation(modal, presentation = "modal") {
    if (!modal || presentation !== "page") return false

    modal.classList.add("settings-page-root")
    modal.classList.remove("modal")
    modal.querySelector("#settingsBackdrop")?.setAttribute("hidden", "")

    const panel = modal.querySelector(".modal-panel")
    panel?.setAttribute("role", "region")
    panel?.removeAttribute("aria-modal")
    panel?.removeAttribute("aria-labelledby")
    panel?.setAttribute("aria-label", "设置")
    modal.querySelector(".modal-header")?.remove()
    return true
  }

  function buildSettingsModalDom() {
    const modal = document.createElement("div")
    modal.className = "modal hidden"
    modal.id = "settingsModal"
    modal.setAttribute("aria-hidden", "true")
    modal.innerHTML = `
      <div class="modal-backdrop" id="settingsBackdrop"></div>
      <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="settingsTitle">
        <div class="modal-header">
          <h2 id="settingsTitle">设置</h2>
          <div class="modal-actions">
            <button class="ghost" id="closeSettingsBtn" type="button">关闭</button>
          </div>
        </div>
        <div class="settings-page-intro">
          <div class="settings-page-heading">
            <div class="settings-page-kicker">偏好与同步</div>
            <h1>设置</h1>
            <p>调整学习节奏、外观、发音、AI 与账号同步。</p>
          </div>
          <div class="settings-page-status" aria-live="polite">
            <span class="settings-page-status-dot" aria-hidden="true"></span>
            <span id="settingsPageStatusText">设置会自动保存在本机</span>
          </div>
        </div>
        <div class="settings-shell">
          <div class="settings-category-tabs" role="tablist" aria-label="设置类别">
            <span class="settings-category-indicator" aria-hidden="true"></span>
            <button class="settings-category-tab" id="settingsTabLearning" type="button" role="tab" aria-controls="settingsPanelLearning" aria-selected="true" tabindex="0">学习</button>
            <button class="settings-category-tab" id="settingsTabAppearance" type="button" role="tab" aria-controls="settingsPanelAppearance" aria-selected="false" tabindex="-1">外观</button>
            <button class="settings-category-tab" id="settingsTabPronunciation" type="button" role="tab" aria-controls="settingsPanelPronunciation" aria-selected="false" tabindex="-1">发音</button>
            <button class="settings-category-tab" id="settingsTabAi" type="button" role="tab" aria-controls="settingsPanelAi" aria-selected="false" tabindex="-1">AI</button>
            <button class="settings-category-tab" id="settingsTabAccount" type="button" role="tab" aria-controls="settingsPanelAccount" aria-selected="false" tabindex="-1">账号</button>
          </div>
          <div class="modal-body">
            <section class="settings-category-panel" id="settingsPanelLearning" role="tabpanel" aria-labelledby="settingsTabLearning">
              <div class="settings-accordion-grid">
                <section class="settings-accordion-card">
                  <header class="settings-card-header">每日目标</header>
                  <div class="settings-accordion-content">
            <div class="form-row">
              <div class="form-label">每日目标轮次</div>
              <div class="form-control">
                <select id="dailyGoalRoundsInput" class="settings-compact-select" aria-label="每日目标轮次">${numericSelectOptions(rangeInclusive(0, 20))}</select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-label">每日目标单词</div>
              <div class="form-control">
                <select id="dailyGoalWordsInput" class="settings-compact-select" aria-label="每日目标单词">${numericSelectOptions(DAILY_GOAL_WORD_CHOICES)}</select>
              </div>
            </div>
            <div class="form-help">填 0 表示不启用该目标；首页与记录页会展示今日进度。</div>
            <div class="form-row">
              <div class="form-label">每轮上限</div>
              <div class="form-control">
                <select id="roundCapInput" class="settings-compact-select" aria-label="每轮上限">${numericSelectOptions(rangeInclusive(20, 30))}</select>
              </div>
            </div>
            <div class="form-help">可选 20–30。修改后对新一轮生效。</div>
                  </div>
                </section>
                <section class="settings-accordion-card">
                  <header class="settings-card-header">复习节奏</header>
                  <div class="settings-accordion-content">
            <div class="form-row">
              <div class="form-label">启用轻量复习</div>
              <div class="form-control"><button class="settings-switch" id="reviewSystemToggleBtn" type="button" role="switch" aria-checked="true"><span class="settings-switch-track" aria-hidden="true"><span class="settings-switch-knob"></span></span></button></div>
            </div>
            <div id="reviewIntervalsPanel">
              <div class="form-row">
                <div class="form-label">不会（天）</div>
                <div class="form-control"><input id="reviewUnknownDaysInput" class="text-input" type="number" min="1" max="60" value="1" /></div>
              </div>
              <div class="form-row">
                <div class="form-label">学习中（天）</div>
                <div class="form-control"><input id="reviewLearningDaysInput" class="text-input" type="number" min="1" max="60" value="3" /></div>
              </div>
              <div class="form-row">
                <div class="form-label">已掌握（天）</div>
                <div class="form-control"><input id="reviewMasteredDaysInput" class="text-input" type="number" min="1" max="365" value="7" /></div>
              </div>
            </div>
            <div class="form-help">到期规则：按状态计算下次复习时间；到期后会显示"待复习"。</div>
                  </div>
                </section>
                <section class="settings-accordion-card">
                  <header class="settings-card-header">学习体验</header>
                  <div class="settings-accordion-content">
            <div class="form-row">
              <div class="form-label">持续背书模式</div>
              <div class="form-control"><button class="settings-switch" id="continuousStudyModeToggleBtn" type="button" role="switch" aria-checked="false"><span class="settings-switch-track" aria-hidden="true"><span class="settings-switch-knob"></span></span></button></div>
            </div>
            <div class="form-help">开启后，普通学习轮的复习结束会自动继续下一词。</div>
            <div class="form-row">
              <div class="form-label">启用复习卡片翻面</div>
              <div class="form-control"><button class="settings-switch" id="reviewCardFlipToggleBtn" type="button" role="switch" aria-checked="false"><span class="settings-switch-track" aria-hidden="true"><span class="settings-switch-knob"></span></span></button></div>
            </div>
                  </div>
                </section>
              </div>
            </section>

            <section class="settings-category-panel" id="settingsPanelAppearance" role="tabpanel" aria-labelledby="settingsTabAppearance" hidden>
              <div class="settings-accordion-grid">
                <section class="settings-accordion-card settings-accordion-wide">
                  <header class="settings-card-header">视觉风格</header>
                  <div class="settings-accordion-content">
            <div class="form-row form-row-palette">
              <div class="form-control">
                <div class="theme-palette-options" id="themePaletteGroup" role="radiogroup" aria-label="视觉风格">
                  <button class="theme-palette-option" data-theme-palette="paper" type="button" role="radio" aria-checked="true"><span class="theme-palette-preview theme-palette-preview-paper" aria-hidden="true"><i>Aa</i><b></b><b></b></span><span class="theme-palette-name">纸本</span><span class="theme-palette-note">衬线 · 暖纸</span></button>
                  <button class="theme-palette-option" data-theme-palette="minimal" type="button" role="radio" aria-checked="false"><span class="theme-palette-preview theme-palette-preview-minimal" aria-hidden="true"><i>Aa</i><b></b><b></b></span><span class="theme-palette-name">极简</span><span class="theme-palette-note">柔和 · 克制</span></button>
                  <button class="theme-palette-option" data-theme-palette="swiss" type="button" role="radio" aria-checked="false"><span class="theme-palette-preview theme-palette-preview-swiss" aria-hidden="true"><i>Aa</i><b></b><b></b></span><span class="theme-palette-name">瑞士</span><span class="theme-palette-note">网格 · 朱红</span></button>
                </div>
              </div>
            </div>
            <div class="form-help">风格只改变界面外观，学习记录与设置不受影响。</div>
                  </div>
                </section>
                <section class="settings-accordion-card settings-accordion-wide">
                  <header class="settings-card-header">明暗模式</header>
                  <div class="settings-accordion-content">
            <div class="form-row">
              <div class="form-label">外观明暗</div>
              <div class="form-control">
                <div class="settings-segmented" id="themeModeGroup" role="radiogroup" aria-label="外观明暗">
                  <button type="button" role="radio" data-theme-mode="auto" aria-checked="true">跟随系统</button>
                  <button type="button" role="radio" data-theme-mode="light" aria-checked="false">浅色</button>
                  <button type="button" role="radio" data-theme-mode="dark" aria-checked="false">深色</button>
                </div>
              </div>
            </div>
            <div class="form-help">跟随系统时随设备自动切换；在学习页按 D 可快速切换浅色与深色。</div>
                  </div>
                </section>
              </div>
            </section>

            <section class="settings-category-panel" id="settingsPanelPronunciation" role="tabpanel" aria-labelledby="settingsTabPronunciation" hidden>
              <div class="settings-accordion-grid">
                <section class="settings-accordion-card">
                  <header class="settings-card-header">发音方式</header>
                  <div class="settings-accordion-content">
            <div class="form-row">
              <div class="form-label">启用发音</div>
              <div class="form-control"><button class="settings-switch" id="pronounceToggleBtn" type="button" role="switch" aria-checked="true"><span class="settings-switch-track" aria-hidden="true"><span class="settings-switch-knob"></span></span></button></div>
            </div>
            <div class="form-row">
              <div class="form-label">发音方式</div>
              <div class="form-control">
                <select id="ttsModeSelect" aria-label="发音方式">
                  <option value="online">在线 TTS（推荐）</option>
                  <option value="offline">离线 TTS（设备本地）</option>
                  <option value="system">系统语音</option>
                </select>
              </div>
            </div>
            <div class="form-row" id="onlineTtsProviderRow">
              <div class="form-label">在线发音源</div>
              <div class="form-control">
                <select id="onlineTtsProviderSelect" aria-label="在线发音源">
                  <option value="edge">Microsoft Edge（国内可用）</option>
                  <option value="google">Google 翻译</option>
                </select>
              </div>
            </div>
            <div class="form-help" id="onlineTtsPrivacyHint">
              在线发音会将朗读文本直接发送给 Microsoft Edge 或 Google 翻译；直连失败时可能通过服务端代理或切换至另一在线源。
            </div>
            <div class="form-row hidden" style="display:none;">
              <div class="form-label">在线兜底开关</div>
              <div class="form-control"><button class="settings-switch" id="onlineTtsToggleBtn" type="button" role="switch" aria-checked="true"><span class="settings-switch-track" aria-hidden="true"><span class="settings-switch-knob"></span></span></button></div>
            </div>
                  </div>
                </section>
                <section class="settings-accordion-card settings-accordion-wide" id="offlineTtsCard">
                  <header class="settings-card-header">离线语音包</header>
                  <div class="settings-accordion-content">
            <div class="form-row offline-tts-section" id="offlineTtsSection">
              <div class="offline-tts-header">
                <div class="form-label">离线语音包</div>
                <button class="ghost" id="offlineTtsRefreshBtn" type="button">刷新</button>
              </div>
              <div class="form-control form-control-stack offline-tts-control">
                <div id="offlineTtsList" class="offline-voice-list"></div>
                <div id="offlineTtsStatus" class="toast offline-tts-status hidden" role="status" aria-live="polite">
                  <div id="offlineTtsStatusMessage"></div>
                  <details id="offlineTtsStatusDetails" class="hidden">
                    <summary>查看技术详情</summary>
                    <div id="offlineTtsStatusDetail" class="form-help"></div>
                  </details>
                </div>
                <div class="form-help offline-tts-hint" id="offlineTtsHint">
                  离线语音包在桌面端和 Android 应用可用；模型存放于应用数据目录，可随时删除。离线模式失败时仅回退系统语音，不会联网。
                </div>
              </div>
            </div>
                  </div>
                </section>
                <section class="settings-accordion-card">
                  <header class="settings-card-header">系统语音</header>
                  <div class="settings-accordion-content">
            <!-- Below are shown when System mode is selected -->
            <div class="form-row">
              <div class="form-label">英语口音</div>
              <div class="form-control">
                <select id="accentSelect" aria-label="英语口音">
                  <option value="auto">自动</option>
                  <option value="us">美式（en-US）</option>
                  <option value="gb">英式（en-GB）</option>
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-label">语言（可选）</div>
              <div class="form-control">
                <select id="pronunciationLangSelect" aria-label="发音语言">
                  <option value="auto">自动（按词书 language）</option>
                  <option value="en">英语</option>
                  <option value="es">西班牙语</option>
                  <option value="ja">日语</option>
                  <option value="ko">韩语</option>
                  <option value="pt">葡萄牙语</option>
                  <option value="fr">法语</option>
                  <option value="de">德语</option>
                  <option value="it">意大利语</option>
                  <option value="eo">世界语</option>
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-label">系统语音模式</div>
              <div class="form-control">
                <select id="voiceModeSelect" aria-label="系统语音模式">
                  <option value="auto">自动选择</option>
                  <option value="manual">手动选择</option>
                </select>
              </div>
            </div>
            <div class="form-row hidden" id="voiceManualRow">
              <div class="form-label">可用系统语音</div>
              <div class="form-control">
                <select id="voiceSelect" aria-label="可用系统语音"></select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-label">当前生效语音</div>
              <div class="form-control">
                <div id="currentVoiceText" class="form-help"></div>
              </div>
            </div>
            <div class="form-help" id="voiceHint"></div>
            <div class="stack">
              <button class="ghost" id="testVoiceBtn" type="button">测试发音</button>
            </div>
                  </div>
                </section>
              </div>
            </section>

            <section class="settings-category-panel" id="settingsPanelAi" role="tabpanel" aria-labelledby="settingsTabAi" hidden>
              <div class="settings-accordion-grid">
                <section class="settings-accordion-card">
                  <header class="settings-card-header">模型配置</header>
                  <div class="settings-accordion-content">
            <div id="aiCustomConfigPanel">
              <div class="form-row">
                <div class="form-label">API 提供商</div>
                <div class="form-control">
                  <select id="aiProviderSelect" aria-label="API 提供商">
                    <option value="openai">OpenAI</option><option value="gemini">Gemini</option>
                    <option value="deepseek">DeepSeek</option><option value="custom">自定义</option>
                  </select>
                </div>
              </div>
              <div class="form-row">
                <div class="form-label">API Base URL</div>
                <div class="form-control"><input id="aiBaseUrlInput" class="text-input" type="text" placeholder="https://api.siliconflow.cn/v1" /></div>
              </div>
              <div class="form-help">仅可连接 OpenAI、Gemini、DeepSeek、Anthropic、SiliconFlow 的官方接口。其他域名会被拦截。</div>
              <div class="form-row">
                <div class="form-label">API Key</div>
                <div class="form-control"><input id="aiApiKeyInput" class="text-input" type="password" placeholder="仅保留在当前会话内存中" /></div>
              </div>
              <div class="form-row">
                <div class="form-label">Model</div>
                <div class="form-control">
                  <div class="ai-model-control">
                    <input id="aiModelInput" class="text-input" type="text" placeholder="可直接输入模型名称" />
                    <button id="aiModelPickerBtn" class="ghost ai-model-picker-btn" type="button" aria-haspopup="dialog">获取模型</button>
                  </div>
                </div>
              </div>
            </div>
                  </div>
                </section>
                <section class="settings-accordion-card">
                  <header class="settings-card-header">生成参数</header>
                  <div class="settings-accordion-content">
            <div class="form-row">
              <div class="form-label">词书类型</div>
              <div class="form-control">
                <select id="aiTypeSelect" aria-label="词书类型">
                  <option value="toefl">托福词书</option><option value="programming">编程词汇</option>
                  <option value="medical">医学词汇</option><option value="jp">日语</option>
                  <option value="kr">韩语</option><option value="fr">法语</option>
                  <option value="de">德语</option><option value="es">西班牙语</option>
                  <option value="it">意大利语</option><option value="ru">俄语</option>
                  <option value="custom">自定义主题</option>
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-label">主题（可选）</div>
              <div class="form-control"><input id="aiCustomTopicInput" class="text-input" type="text" placeholder="可选：为词书增加主题/领域" /></div>
            </div>
            <div class="form-row">
              <div class="form-label">数量</div>
              <div class="form-control"><input id="aiCountInput" class="text-input" type="number" min="10" max="500" value="120" /></div>
            </div>
            <div class="stack"><button class="primary full" id="aiGenerateBtn" type="button">生成并预览</button></div>
            <div class="form-help" id="aiStatus"></div>
                  </div>
                </section>
                <section class="settings-accordion-card settings-accordion-wide">
                  <header class="settings-card-header">查词补充</header>
                  <div class="settings-accordion-content">
            <div class="form-row">
              <div class="form-label">联网补充</div>
              <div class="form-control"><button class="settings-switch" id="lookupOnlineToggleBtn" type="button" role="switch" aria-checked="true"><span class="settings-switch-track" aria-hidden="true"><span class="settings-switch-knob"></span></span></button></div>
            </div>
            <div class="form-row">
              <div class="form-label">补充来源</div>
              <div class="form-control">
                <select id="lookupOnlineSourceSelect" aria-label="查词补充来源">
                  <option value="builtin">内置在线补充源（默认）</option>
                  <option value="custom">自定义 API（替换内置）</option>
                </select>
              </div>
            </div>
            <div class="form-help">选择「自定义 API」后会复用上方「模型配置」中的 API。</div>
            <div class="form-row">
              <div class="form-label">西语动词变位</div>
              <div class="form-control"><button class="settings-switch" id="lookupSpanishToggleBtn" type="button" role="switch" aria-checked="true"><span class="settings-switch-track" aria-hidden="true"><span class="settings-switch-knob"></span></span></button></div>
            </div>
            <div class="form-row">
              <div class="form-label">查词缓存</div>
              <div class="form-control"><button class="settings-switch" id="lookupCacheToggleBtn" type="button" role="switch" aria-checked="true"><span class="settings-switch-track" aria-hidden="true"><span class="settings-switch-knob"></span></span></button></div>
            </div>
            <div class="form-row">
              <div class="form-label">缓存时长（天）</div>
              <div class="form-control"><input id="lookupCacheDaysInput" class="text-input" type="number" min="1" max="365" value="30" /></div>
            </div>
                  </div>
                </section>

              </div>
            </section>

            <section class="settings-category-panel" id="settingsPanelAccount" role="tabpanel" aria-labelledby="settingsTabAccount" hidden>
              <section class="panel account-panel" id="accountPanel">
                <div class="section-title">云端账号</div>
                <div id="accountLoggedOut">
                  <div class="form-help">登录后可用云端备份；没有账号可注册或重置密码。</div>
                  <div class="account-oauth hidden" id="accountOauthEntry">
                    <button class="account-oauth-btn" id="cloudGoogleLoginBtn" type="button">
                      <span class="account-oauth-google-icon" aria-hidden="true">
                        <svg viewBox="0 0 48 48" width="18" height="18" focusable="false">
                          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                        </svg>
                      </span>
                      <span class="account-oauth-btn-label">使用 Google 账号继续</span>
                    </button>
                  </div>
                  <div class="account-auth-divider hidden" id="accountOauthDivider" role="separator" aria-label="或使用邮箱">
                    <span>或使用邮箱</span>
                  </div>
                  <div class="view-tabs account-tabs" role="tablist" aria-label="账号操作">
                    <button class="ghost active" id="accountTabLoginBtn" type="button" role="tab" aria-selected="true">登录</button>
                    <button class="ghost" id="accountTabRegisterBtn" type="button" role="tab" aria-selected="false">注册</button>
                    <button class="ghost" id="accountTabResetBtn" type="button" role="tab" aria-selected="false">重置密码</button>
                  </div>
                  <div class="account-section hidden" id="accountRegisterSection">
                    <div class="account-section-title">邮箱验证码注册</div>
                    <div class="form-row">
                      <div class="form-label">注册邮箱</div>
                      <div class="form-control form-control-stack">
                        <input id="cloudEmailInput" class="text-input" type="email" placeholder="用于接收注册验证码" autocomplete="email" />
                        <div id="cloudEmailHint" class="form-help field-help hidden"></div>
                      </div>
                    </div>
                    <div class="form-row">
                      <div class="form-label">注册验证码</div>
                      <div class="form-control form-control-stack">
                        <input id="cloudRegisterCodeInput" class="text-input" type="text" inputmode="numeric" maxlength="6" pattern="\\d{6}" placeholder="6 位验证码" autocomplete="one-time-code" />
                        <div id="cloudRegisterCodeHint" class="form-help field-help hidden"></div>
                      </div>
                    </div>
                    <div class="account-actions">
                      <button class="ghost full" id="cloudSendCodeBtn" type="button">发送注册验证码</button>
                    </div>
                    <div class="form-row">
                      <div class="form-label">用户名</div>
                      <div class="form-control form-control-stack">
                        <input id="cloudUsernameInput" class="text-input" type="text" maxlength="32" placeholder="注册用户名" autocomplete="username" />
                        <div id="cloudUsernameHint" class="form-help field-help hidden"></div>
                      </div>
                    </div>
                    <div class="form-row">
                      <div class="form-label">密码</div>
                      <div class="form-control form-control-stack">
                        <input id="cloudPasswordInput" class="text-input" type="password" minlength="8" placeholder="注册密码" autocomplete="new-password" />
                        <div id="cloudPasswordHint" class="form-help field-help hidden"></div>
                      </div>
                    </div>
                    <div class="account-actions">
                      <button class="ghost full" id="cloudRegisterBtn" type="button">邮箱验证码注册</button>
                    </div>
                  </div>
                  <div class="account-section" id="accountLoginSection">
                    <div class="account-section-title">账号登录</div>
                    <div class="form-row">
                      <div class="form-label">登录邮箱</div>
                      <div class="form-control form-control-stack">
                        <input id="cloudLoginEmailInput" class="text-input" type="email" placeholder="输入注册邮箱" autocomplete="email" />
                        <div id="cloudLoginEmailHint" class="form-help field-help hidden"></div>
                      </div>
                    </div>
                    <div class="form-row">
                      <div class="form-label">密码</div>
                      <div class="form-control form-control-stack">
                        <input id="cloudLoginPasswordInput" class="text-input" type="password" minlength="8" placeholder="输入密码" autocomplete="current-password" />
                        <div id="cloudLoginPasswordHint" class="form-help field-help hidden"></div>
                      </div>
                    </div>
                    <div class="account-actions">
                      <button class="primary full" id="cloudLoginBtn" type="button">登录</button>
                    </div>
                  </div>
                  <div class="account-section hidden" id="accountResetSection">
                    <div class="account-section-title">重置密码</div>
                    <div class="form-row">
                      <div class="form-label">重置邮箱</div>
                      <div class="form-control form-control-stack">
                        <input id="cloudResetEmailInput" class="text-input" type="email" placeholder="接收重置验证码的邮箱" autocomplete="email" />
                        <div id="cloudResetEmailHint" class="form-help field-help hidden"></div>
                      </div>
                    </div>
                    <div class="form-row">
                      <div class="form-label">重置验证码</div>
                      <div class="form-control form-control-stack">
                        <input id="cloudResetCodeInput" class="text-input" type="text" inputmode="numeric" maxlength="6" pattern="\\d{6}" placeholder="6 位验证码" autocomplete="one-time-code" />
                        <div id="cloudResetCodeHint" class="form-help field-help hidden"></div>
                      </div>
                    </div>
                    <div class="account-actions">
                      <button class="ghost full" id="cloudSendResetCodeBtn" type="button">发送重置验证码</button>
                    </div>
                    <div class="form-row">
                      <div class="form-label">新密码</div>
                      <div class="form-control form-control-stack">
                        <input id="cloudResetPasswordInput" class="text-input" type="password" minlength="8" placeholder="至少 8 位" autocomplete="new-password" />
                        <div id="cloudResetPasswordHint" class="form-help field-help hidden"></div>
                      </div>
                    </div>
                    <div class="account-actions">
                      <button class="ghost full" id="cloudResetPasswordBtn" type="button">重置密码</button>
                    </div>
                  </div>
                </div>
                <div id="accountLoggedIn" class="hidden">
                  <div class="account-summary account-summary-compact">
                    <div class="account-summary-head">
                      <div class="account-summary-identity">
                        <div class="account-summary-title" id="cloudAccountTitle">已登录</div>
                        <div class="account-summary-subtitle" id="cloudAccountSubtitle">当前浏览器已启用云端备份</div>
                      </div>
                      <div class="account-badge">在线</div>
                    </div>
                    <div class="account-summary-sync">
                      <div class="account-summary-sync-state">
                        <span>云备份</span>
                        <strong id="cloudBackupStateText">已启用</strong>
                      </div>
                      <div class="account-summary-sync-latest">
                        <span>最近同步</span>
                        <strong id="cloudLastSyncText">尚未同步</strong>
                      </div>
                    </div>
                    <div class="account-summary-key-stats">
                      <div class="account-summary-stat"><span>单词</span><strong id="cloudWordsText">0</strong></div>
                      <div class="account-summary-stat"><span>连续</span><strong id="cloudStreakText">0 天</strong></div>
                      <div class="account-summary-stat"><span>当前轮</span><strong id="cloudCurrentRoundText">未开始</strong></div>
                    </div>
                    <button class="account-summary-details-toggle" id="accountStatsToggleBtn" type="button" aria-expanded="false" aria-controls="accountStatsDetails">更多学习统计</button>
                    <div id="accountStatsDetails" class="account-summary-details hidden">
                      <div class="account-summary-secondary-stats">
                        <div class="account-summary-stat"><span>轮次</span><strong id="cloudRoundsText">0</strong></div>
                        <div class="account-summary-stat"><span>今日新增</span><strong id="cloudTodayWordsText">0</strong></div>
                        <div class="account-summary-stat"><span>今日完成</span><strong id="cloudTodayRoundsText">0 轮</strong></div>
                      </div>
                      <div class="account-summary-session"><span>会话</span><strong id="cloudSessionText">刚刚开始</strong></div>
                    </div>
                    <div class="account-cloud-actions">
                      <button class="account-cloud-action account-cloud-action-upload" id="cloudUploadBtn" type="button">
                        <span class="account-cloud-action-icon" aria-hidden="true">↑</span>
                        <span class="account-cloud-action-copy">
                          <strong class="account-cloud-action-title" id="cloudUploadLabel">上传云端</strong>
                          <small>用本机数据更新云备份</small>
                        </span>
                      </button>
                      <button class="account-cloud-action account-cloud-action-restore" id="cloudDownloadBtn" type="button">
                        <span class="account-cloud-action-icon" aria-hidden="true">↓</span>
                        <span class="account-cloud-action-copy">
                          <strong class="account-cloud-action-title" id="cloudDownloadLabel">恢复本机</strong>
                          <small>用云备份覆盖当前设备</small>
                        </span>
                      </button>
                    </div>
                    <button class="account-logout-action" id="cloudLogoutBtn" type="button">退出登录</button>
                    <div class="form-help account-sync-note" id="cloudSyncStatus"></div>
                  </div>
                </div>
                <div class="form-help account-status hidden" id="accountStatus"></div>
              </section>
              <div class="settings-accordion-grid settings-account-extras">
                <section class="settings-accordion-card">
                  <header class="settings-card-header">数据管理</header>
                  <div class="settings-accordion-content">
            <div class="stack">
              <button class="ghost full" id="exportBackupBtn" type="button">导出完整学习数据（JSON）</button>
              <button class="ghost full" id="importBackupBtn" type="button">导入完整学习数据（JSON）</button>
              <input id="importBackupFile" type="file" accept=".json,application/json" hidden />
            </div>
            <div class="form-help">包含学习记录与设置；导入会覆盖当前浏览器本地数据。</div>
                  </div>
                </section>

                <section class="settings-accordion-card" id="versionPanel">
                  <header class="settings-card-header">版本信息</header>
                  <div class="settings-accordion-content">
            <div class="form-row">
              <div class="form-label">当前版本</div>
              <div class="form-control"><span class="form-help" id="versionText">v${window.A4Updater?.APP_VERSION || "1.0.0"}</span></div>
            </div>
            <div class="stack" style="margin-top:4px"><button class="ghost full" id="checkUpdateBtn" type="button">检查更新</button></div>
            <div class="form-help hidden" id="updateStatus"></div>
                  </div>
                </section>
              </div>
            </section>
          </div>
        </div>
      </div>
    `
    return modal
  }

  function listenForAccountStatsBreakpoint(mediaQuery, onChange) {
    if (!mediaQuery || typeof onChange !== "function") return () => {}
    const listener = (event) => onChange(!!event?.matches)

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", listener)
      return () => mediaQuery.removeEventListener?.("change", listener)
    }
    if (typeof mediaQuery.addListener === "function") {
      mediaQuery.addListener(listener)
      return () => mediaQuery.removeListener?.(listener)
    }
    return () => {}
  }

  function shouldExpandAccountStatsByDefault(mediaQuery) {
    return mediaQuery ? !!mediaQuery.matches : true
  }

  function buildAiPreviewModalDom() {
    const modal = document.createElement("div")
    modal.className = "modal hidden"
    modal.id = "aiPreviewModal"
    modal.setAttribute("aria-hidden", "true")
    modal.innerHTML = `
      <div class="modal-backdrop" id="aiPreviewBackdrop"></div>
      <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="aiPreviewTitle">
        <div class="modal-header">
          <h2 id="aiPreviewTitle">预览词书</h2>
          <div class="modal-actions">
            <button class="ghost" id="closeAiPreviewBtn" type="button">关闭</button>
          </div>
        </div>
        <div class="modal-body">
          <div class="review-meta" id="aiPreviewMeta"></div>
          <div class="words-list" id="aiPreviewList"></div>
          <div class="stack">
            <button class="primary full" id="aiConfirmBtn" type="button">确认保存到本地词书</button>
          </div>
        </div>
      </div>
    `
    return modal
  }

  function setModalVisible(modal, visible, options = {}) {
    if (!modal) return
    const sharedSetLayerVisible = window.A4UI?.setLayerVisible || window.A4Common?.setModalVisible
    if (sharedSetLayerVisible) {
      sharedSetLayerVisible(modal, visible, options)
      return
    }
    if (visible) {
      modal.classList.remove("hidden")
      modal.setAttribute("aria-hidden", "false")
    } else {
      modal.classList.add("hidden")
      modal.setAttribute("aria-hidden", "true")
    }
  }


  ns.dom = {
    installSettingsCategoryNavigation,
    setSwitchChecked,
    DAILY_GOAL_WORD_CHOICES,
    rangeInclusive,
    numericSelectOptions,
    fillNumericSelect,
    configureSettingsPresentation,
    buildSettingsModalDom,
    listenForAccountStatsBreakpoint,
    shouldExpandAccountStatsByDefault,
    buildAiPreviewModalDom,
    setModalVisible,
  }
})()
