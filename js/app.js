/**
 * 0924产品目录 · 核心交互引擎 (手机触控优化与双模式增强版)
 * 支持: 3D 拟真物理书本 (带闭合精装态) + 小说整页平推双模式无缝切换
 * 彻底解决移动端手势失灵、翻页卡死、无触控反馈问题
 */

(function () {
  'use strict';

  // 全局核心状态
  const STATE = {
    mode: 'book', // 'book' | 'slide'
    currentPage: 0, // 0-based: 0 ~ 11
    totalPages: 12,
    pageRatio: 1.488 // 1920 / 1290 横版高保真比例
  };

  // DOM 节点引用
  const flipbookEl = document.getElementById('flipbook');
  const flipbookWrapper = document.getElementById('flipbookWrapper');
  const slideWrapper = document.getElementById('slideWrapper');
  const slideCards = document.querySelectorAll('.slide-card');
  const btnToggleMode = document.getElementById('btnToggleMode');
  const modeText = document.getElementById('modeText');
  const modeIcon = document.getElementById('modeIcon');
  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');
  const currentPageEl = document.getElementById('currentPage');
  const totalPageEl = document.getElementById('totalPage');
  const btnFullscreen = document.getElementById('btnFullscreen');
  const floatingControls = document.getElementById('floatingControls');
  const topNav = document.getElementById('topNav');
  const glowLeft = document.getElementById('glowLeft');
  const glowRight = document.getElementById('glowRight');
  const actionFeedbackPill = document.getElementById('actionFeedbackPill');
  const pageIndicator = document.querySelector('.page-indicator');

  let pageFlip = null;
  let hideControlsTimer = null;
  let feedbackTimer = null;

  // ============================================================
  // 0. 高性能图片预加载管理器 (彻底消灭翻页黑屏)
  // ============================================================
  const imageCache = [];
  function preloadAllImages() {
    for (let i = 1; i <= STATE.totalPages; i++) {
      const img = new Image();
      const numStr = String(i).padStart(2, '0');
      img.src = `images/page_${numStr}.webp`;
      imageCache.push(img);
    }
  }

  // ============================================================
  // 1. 触控与操作反馈系统 (视觉微光 + 震动 + 提示胶囊)
  // ============================================================
  function triggerActionFeedback(direction, pageNum) {
    // 1. 移动端微震动反馈 (支持的手机浏览器触发)
    try {
      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(15);
      }
    } catch (e) {}

    // 2. 边缘微光反馈
    if (direction === 'next' && glowRight) {
      glowRight.classList.add('active');
      setTimeout(() => glowRight.classList.remove('active'), 280);
    } else if (direction === 'prev' && glowLeft) {
      glowLeft.classList.add('active');
      setTimeout(() => glowLeft.classList.remove('active'), 280);
    }

    // 3. 页码指示器轻微弹跳反馈
    if (pageIndicator) {
      pageIndicator.classList.remove('bump');
      // 强制重绘
      void pageIndicator.offsetWidth;
      pageIndicator.classList.add('bump');
    }

    // 4. 屏幕上方胶囊提示
    if (actionFeedbackPill) {
      actionFeedbackPill.textContent = direction === 'next' ? `下一页 (${pageNum}/${STATE.totalPages})` : `上一页 (${pageNum}/${STATE.totalPages})`;
      actionFeedbackPill.classList.add('show');
      clearTimeout(feedbackTimer);
      feedbackTimer = setTimeout(() => {
        actionFeedbackPill.classList.remove('show');
      }, 700);
    }
  }

  // ============================================================
  // 2. 3D 仿真书本初始化与闭合状态管理
  // ============================================================
  function getBookDimensions() {
    const isMobile = window.innerWidth <= 768;
    const stageWidth = window.innerWidth;
    const stageHeight = window.innerHeight;

    if (isMobile) {
      // 移动端：单页模式
      const targetWidth = Math.min(stageWidth * 0.94, 540);
      const targetHeight = Math.round(targetWidth / STATE.pageRatio);

      return {
        width: Math.round(targetWidth),
        height: Math.round(targetHeight),
        size: 'fixed',
        usePortrait: true
      };
    } else {
      // 电脑端：左右对开双页模式
      const availableHeight = Math.min(stageHeight * 0.74, 580);
      let singleWidth = Math.round(availableHeight * STATE.pageRatio);
      let singleHeight = availableHeight;

      if (singleWidth * 2 > stageWidth * 0.92) {
        singleWidth = Math.round((stageWidth * 0.92) / 2);
        singleHeight = Math.round(singleWidth / STATE.pageRatio);
      }

      return {
        width: Math.round(singleWidth),
        height: Math.round(singleHeight),
        size: 'fixed',
        usePortrait: false
      };
    }
  }

  function initBookFlip() {
    if (pageFlip) {
      try {
        pageFlip.destroy();
      } catch (e) {}
    }

    const dims = getBookDimensions();
    const pages = document.querySelectorAll('.page');
    STATE.totalPages = pages.length;
    totalPageEl.textContent = String(STATE.totalPages).padStart(2, '0');

    // 移动端完全禁用 St.PageFlip 自身缺陷的内部 Touch 拦截，交由全局统管
    const isMobile = window.innerWidth <= 768;

    pageFlip = new St.PageFlip(flipbookEl, {
      width: dims.width,
      height: dims.height,
      size: dims.size,
      minWidth: 260,
      maxWidth: 1600,
      minHeight: 200,
      maxHeight: 1200,
      showCover: true,
      usePortrait: dims.usePortrait,
      flippingTime: 550,
      maxShadowOpacity: 0.5,
      mobileScrollSupport: true,
      useMouseEvents: !isMobile, // 移动端关闭自带鼠标/触控冲突捕获
      swipeDistance: 25,
      clickEventForward: true
    });

    pageFlip.loadFromHTML(pages);

    // 监听书本翻页完成
    pageFlip.on('flip', (e) => {
      if (STATE.mode === 'book') {
        const pageIndex = e.data;
        updateGlobalPage(pageIndex, 'book');
        showControlsTemporarily();
      }
    });

    pageFlip.on('init', (e) => {
      if (STATE.mode === 'book') {
        const initialPage = e.data.page;
        updateGlobalPage(initialPage, 'book');
      }
    });
  }

  // 封面/封底居中与闭合精装管理
  function updateClosedBookState(index) {
    if (index === 0) {
      flipbookWrapper.classList.add('is-closed');
      flipbookWrapper.classList.remove('is-closed-back');
    } else if (index === STATE.totalPages - 1) {
      flipbookWrapper.classList.add('is-closed-back');
      flipbookWrapper.classList.remove('is-closed');
    } else {
      flipbookWrapper.classList.remove('is-closed', 'is-closed-back');
    }
  }

  // ============================================================
  // 3. 小说式平面整页滑推引擎 (Novel Slider)
  // ============================================================
  function updateSlideView(index, animate = true) {
    slideCards.forEach((card, idx) => {
      card.style.transform = '';
      card.style.opacity = '';
      card.classList.remove('no-transition');

      if (!animate) {
        card.classList.add('no-transition');
      }

      card.classList.remove('active', 'prev', 'next');
      if (idx === index) {
        card.classList.add('active');
      } else if (idx < index) {
        card.classList.add('prev');
      } else {
        card.classList.add('next');
      }
    });

    if (!animate) {
      // 强制重绘后恢复 transition
      requestAnimationFrame(() => {
        slideCards.forEach(c => c.classList.remove('no-transition'));
      });
    }
  }

  // ============================================================
  // 4. 超顺滑手指实时跟手与弹性吸附手势引擎
  // ============================================================
  function setupUnifiedGestures() {
    // 监听范围提升至全视口容器，消除一切边缘触控死角
    const stage = document.getElementById('viewport') || document.getElementById('bookStage');
    if (!stage) return;

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let currentX = 0;
    let currentY = 0;
    let isTracking = false;
    let isSwiping = false;
    let gestureDecided = false; // 是否已判定手势方向
    let hasPreviewFeedback = false; // 是否已触发翻页预反馈

    // 获取当前活动卡片及邻近卡片
    function getActiveCards() {
      const curIdx = STATE.currentPage;
      const curCard = slideCards[curIdx];
      const nextCard = curIdx < STATE.totalPages - 1 ? slideCards[curIdx + 1] : null;
      const prevCard = curIdx > 0 ? slideCards[curIdx - 1] : null;
      return { curCard, nextCard, prevCard };
    }

    const onTouchStart = (e) => {
      // 避免多指缩放时干扰
      if (e.touches.length !== 1) {
        isTracking = false;
        return;
      }

      // 如果触摸点落在控制栏或顶部按钮上，不拦截点击
      const target = e.target;
      if (target.closest('#floatingControls') || target.closest('#topNav')) {
        isTracking = false;
        return;
      }

      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      currentX = startX;
      currentY = startY;
      startTime = performance.now();
      isTracking = true;
      isSwiping = false;
      gestureDecided = false;
      hasPreviewFeedback = false;

      // 如果在小说平推模式下，移除 transition，开启零延迟跟手
      if (STATE.mode === 'slide') {
        const { curCard, nextCard, prevCard } = getActiveCards();
        if (curCard) curCard.classList.add('no-transition');
        if (nextCard) nextCard.classList.add('no-transition');
        if (prevCard) prevCard.classList.add('no-transition');
      }
    };

    const onTouchMove = (e) => {
      if (!isTracking) return;
      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      // 方向判定阶段：3px 极速启滑门槛，放宽倾斜角容错（水平夹角 > 25 度即可）
      if (!gestureDecided) {
        if (absX >= 3 || absY >= 3) {
          if (absX >= absY * 0.46 && absX >= 3) {
            isSwiping = true;
            gestureDecided = true;
          } else if (absY > 18) {
            // 明确为垂直方向意图，放弃跟踪
            isTracking = false;
            gestureDecided = true;
            return;
          }
        }
      }

      if (isSwiping) {
        // 彻底阻断原生浏览器的边缘回弹手势争抢
        if (e.cancelable) {
          e.preventDefault();
        }
        currentX = touch.clientX;
        currentY = touch.clientY;

        if (STATE.mode === 'slide') {
          const screenW = window.innerWidth;
          const { curCard, nextCard, prevCard } = getActiveCards();

          // 边界弹性阻尼：第 1 页向右拉或最后一页向左拉施加 0.25 阻尼
          let effectiveDelta = deltaX;
          if ((STATE.currentPage === 0 && deltaX > 0) ||
              (STATE.currentPage === STATE.totalPages - 1 && deltaX < 0)) {
            effectiveDelta = deltaX * 0.25;
          }

          // 当前页实时跟手（硬件加速图层）
          if (curCard) {
            curCard.style.transform = `translate3d(${effectiveDelta}px, 0, 0)`;
            const opacityFactor = 1 - Math.min(Math.abs(effectiveDelta) / (screenW * 1.8), 0.4);
            curCard.style.opacity = `${opacityFactor}`;
          }

          // 目标邻近卡片自适应透出跟随
          if (effectiveDelta < 0 && nextCard) {
            // 手指向左拉，下一页从右边跟进来
            const nextOffset = screenW + effectiveDelta;
            nextCard.style.transform = `translate3d(${nextOffset}px, 0, 0)`;
            nextCard.style.opacity = '1';
            nextCard.style.zIndex = '9';
          } else if (effectiveDelta > 0 && prevCard) {
            // 手指向右拉，上一页从左边跟进来
            const prevOffset = -screenW + effectiveDelta;
            prevCard.style.transform = `translate3d(${prevOffset}px, 0, 0)`;
            prevCard.style.opacity = '1';
            prevCard.style.zIndex = '9';
          }

          // 实时触觉/视觉微光预反馈：滑过门槛即刻触发微光
          if (!hasPreviewFeedback && Math.abs(effectiveDelta) > screenW * 0.08) {
            hasPreviewFeedback = true;
            if (effectiveDelta < 0 && glowRight) {
              glowRight.classList.add('active');
              setTimeout(() => glowRight.classList.remove('active'), 180);
            } else if (effectiveDelta > 0 && glowLeft) {
              glowLeft.classList.add('active');
              setTimeout(() => glowLeft.classList.remove('active'), 180);
            }
          }
        }
      }
    };

    const onTouchEnd = (e) => {
      if (!isTracking && !isSwiping) return;
      isTracking = false;

      const touch = e.changedTouches && e.changedTouches[0];
      const deltaX = (touch ? touch.clientX : currentX) - startX;
      const deltaTime = performance.now() - startTime;
      const absDeltaX = Math.abs(deltaX);
      const screenW = window.innerWidth;
      const velocity = absDeltaX / Math.max(deltaTime, 1); // 像素/毫秒

      // 1. 如果在小说平推模式下，执行物理吸附/回弹
      if (STATE.mode === 'slide') {
        slideCards.forEach(c => c.classList.remove('no-transition'));

        // 极致灵敏判定阈值：
        // 门槛 1：位移超过屏幕 8% (手机屏 390px 仅需 31px)
        // 门槛 2：轻拨轻甩 (速度 > 0.15px/ms 且位移 > 12px)
        const isFlick = velocity > 0.15 && absDeltaX > 12;
        const isPastThreshold = absDeltaX > screenW * 0.08;

        if (deltaX < 0 && (isFlick || isPastThreshold) && STATE.currentPage < STATE.totalPages - 1) {
          // 左滑 -> 顺滑翻下一页
          goToNextPage();
        } else if (deltaX > 0 && (isFlick || isPastThreshold) && STATE.currentPage > 0) {
          // 右滑 -> 顺滑翻上一页
          goToPrevPage();
        } else if (isSwiping) {
          // 未达到翻页阈值：平滑弹性吸附回弹本页
          updateSlideView(STATE.currentPage, true);
        } else if (!isSwiping && absDeltaX < 15 && deltaTime < 350) {
          // 点击屏幕左/右侧翻页 (Tap 分流：左 35% 上一页，右 35% 下一页，中间 30% 唤醒工具栏)
          const clickX = touch ? touch.clientX : startX;
          if (clickX > screenW * 0.65) {
            goToNextPage();
          } else if (clickX < screenW * 0.35) {
            goToPrevPage();
          } else {
            showControlsTemporarily();
          }
        }
        isSwiping = false;
        gestureDecided = false;
        return;
      }

      // 2. 如果在 3D 书本模式下
      if (absDeltaX > 18 && deltaTime < 900) {
        if (deltaX < 0) goToNextPage();
        else goToPrevPage();
      } else if (absDeltaX < 15 && deltaTime < 350) {
        const clickX = touch ? touch.clientX : startX;
        if (clickX > screenW * 0.65) goToNextPage();
        else if (clickX < screenW * 0.35) goToPrevPage();
        else showControlsTemporarily();
      }
      isSwiping = false;
      gestureDecided = false;
    };

    stage.addEventListener('touchstart', onTouchStart, { passive: true });
    stage.addEventListener('touchmove', onTouchMove, { passive: false });
    stage.addEventListener('touchend', onTouchEnd, { passive: true });
    stage.addEventListener('touchcancel', onTouchEnd, { passive: true });
  }

  // ============================================================
  // 5. 全局页码管理与调度
  // ============================================================
  function updateGlobalPage(newIndex, sourceView) {
    STATE.currentPage = Math.max(0, Math.min(newIndex, STATE.totalPages - 1));

    // 更新底部指示器
    currentPageEl.textContent = String(STATE.currentPage + 1).padStart(2, '0');
    totalPageEl.textContent = String(STATE.totalPages).padStart(2, '0');

    // 更新按钮状态
    btnPrev.disabled = STATE.currentPage <= 0;
    btnNext.disabled = STATE.currentPage >= STATE.totalPages - 1;

    // 同步视图渲染
    if (STATE.mode === 'book') {
      updateClosedBookState(STATE.currentPage);
    } else {
      updateSlideView(STATE.currentPage);
    }
  }

  function goToNextPage() {
    if (STATE.currentPage >= STATE.totalPages - 1) return;

    const targetPage = STATE.currentPage + 2; // 展示页码 (1-based)
    triggerActionFeedback('next', targetPage);

    if (STATE.mode === 'book' && pageFlip) {
      pageFlip.flipNext();
    } else {
      updateGlobalPage(STATE.currentPage + 1, 'slide');
    }
    showControlsTemporarily();
  }

  function goToPrevPage() {
    if (STATE.currentPage <= 0) return;

    const targetPage = STATE.currentPage; // 展示页码 (1-based)
    triggerActionFeedback('prev', targetPage);

    if (STATE.mode === 'book' && pageFlip) {
      pageFlip.flipPrev();
    } else {
      updateGlobalPage(STATE.currentPage - 1, 'slide');
    }
    showControlsTemporarily();
  }

  // ============================================================
  // 6. 双模式无缝切换
  // ============================================================
  function toggleViewMode() {
    if (STATE.mode === 'book') {
      // 切换到小说整页平推
      STATE.mode = 'slide';
      document.body.classList.remove('mode-book');
      document.body.classList.add('mode-slide');

      modeText.textContent = '切换为仿真书本';
      modeIcon.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path fill="currentColor" d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/>
        </svg>
      `;

      // 立即刷新小说视图到当前页码
      updateSlideView(STATE.currentPage);
    } else {
      // 切换到 3D 仿真书本
      STATE.mode = 'book';
      document.body.classList.remove('mode-slide');
      document.body.classList.add('mode-book');

      modeText.textContent = '切换为小说平推';
      modeIcon.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
        </svg>
      `;

      // 唤醒书本容器并同步页码
      if (!pageFlip) {
        initBookFlip();
      }
      if (pageFlip) {
        try {
          pageFlip.turnToPage(STATE.currentPage);
        } catch (e) {}
        updateClosedBookState(STATE.currentPage);
      }
    }

    showControlsTemporarily();
  }

  // ============================================================
  // 7. 控制栏沉浸式自动隐藏与双轨全屏管理器 (原生全屏 + CSS沉浸全屏)
  // ============================================================
  function showControlsTemporarily() {
    floatingControls.classList.remove('hidden');
    topNav.style.opacity = '0.92';
    clearTimeout(hideControlsTimer);
    hideControlsTimer = setTimeout(() => {
      // 桌面端自动隐退，移动端保持在更低亮度常驻（由 CSS @media 控制）
      floatingControls.classList.add('hidden');
      topNav.style.opacity = '0.45';
    }, 4000);
  }

  // 状态与 UI 同步
  let isWebFullscreen = false;

  function isNativeFullscreen() {
    const doc = window.document;
    return !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);
  }

  function isCurrentFullscreen() {
    return isNativeFullscreen() || isWebFullscreen;
  }

  function updateFullscreenUI(active) {
    if (active) {
      document.body.classList.add('is-fullscreen');
      if (btnFullscreen) {
        btnFullscreen.classList.add('btn-fullscreen-active');
        btnFullscreen.setAttribute('title', '退出全屏');
        btnFullscreen.setAttribute('aria-label', '退出全屏');
      }
    } else {
      document.body.classList.remove('is-fullscreen');
      if (btnFullscreen) {
        btnFullscreen.classList.remove('btn-fullscreen-active');
        btnFullscreen.setAttribute('title', '全屏浏览');
        btnFullscreen.setAttribute('aria-label', '全屏浏览');
      }
    }
  }

  function showActionToast(text) {
    if (actionFeedbackPill) {
      actionFeedbackPill.textContent = text;
      actionFeedbackPill.classList.add('show');
      clearTimeout(feedbackTimer);
      feedbackTimer = setTimeout(() => {
        actionFeedbackPill.classList.remove('show');
      }, 1000);
    }
  }

  function toggleFullscreen() {
    const doc = window.document;
    const docEl = doc.documentElement;
    const requestFs = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.webkitRequestFullScreen || docEl.mozRequestFullScreen || docEl.msRequestFullscreen;
    const cancelFs = doc.exitFullscreen || doc.webkitExitFullscreen || doc.webkitCancelFullScreen || doc.mozCancelFullScreen || doc.msExitFullscreen;

    // 轻微震动反馈
    try {
      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(20);
      }
    } catch (e) {}

    // 当前处于全屏态（原生或CSS网页全屏）：统一退出
    if (isCurrentFullscreen()) {
      if (isNativeFullscreen() && cancelFs) {
        try {
          const p = cancelFs.call(doc);
          if (p && p.catch) p.catch(() => {});
        } catch (e) {}
      }
      isWebFullscreen = false;
      updateFullscreenUI(false);
      showActionToast('已退出全屏');
      
      // 触发页面视口尺寸重绘自适应
      setTimeout(() => {
        if (STATE.mode === 'book' && pageFlip) {
          initBookFlip();
          pageFlip.turnToPage(STATE.currentPage);
        }
      }, 150);
      return;
    }

    // 当前未全屏：尝试原生全屏；若不支持或受限（iOS Safari / 微信 WebView），优雅降级为网页沉浸全屏
    if (requestFs) {
      try {
        const p = requestFs.call(docEl);
        if (p && typeof p.then === 'function') {
          p.then(() => {
            updateFullscreenUI(true);
            showActionToast('已进入全屏模式');
          }).catch(() => {
            // 原生全屏被宿主环境（如微信 WebView）拦截或权限拒绝，无缝降级为沉浸网页全屏
            isWebFullscreen = true;
            updateFullscreenUI(true);
            showActionToast('已进入沉浸全屏');
          });
        } else {
          // 旧版同步返回或无 Promise 的 WebKit
          isWebFullscreen = true;
          updateFullscreenUI(true);
          showActionToast('已进入沉浸全屏');
        }
      } catch (err) {
        // 抛出异常（如 iOS Safari 对常规 DOM 抛异常），降级为沉浸网页全屏
        isWebFullscreen = true;
        updateFullscreenUI(true);
        showActionToast('已进入沉浸全屏');
      }
    } else {
      // 完全无原生 requestFullscreen 接口（如 iOS 设备），直接启用沉浸式全屏
      isWebFullscreen = true;
      updateFullscreenUI(true);
      showActionToast('已进入沉浸全屏');
    }

    // 重新校准书本舞台比例
    setTimeout(() => {
      if (STATE.mode === 'book' && pageFlip) {
        initBookFlip();
        pageFlip.turnToPage(STATE.currentPage);
      }
    }, 150);
  }

  // ============================================================
  // 8. 全局交互事件绑定
  // ============================================================
  function setupEventListeners() {
    // 模式切换
    btnToggleMode.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleViewMode();
    });

    // 底部控制胶囊翻页
    btnPrev.addEventListener('click', (e) => {
      e.stopPropagation();
      goToPrevPage();
    });

    btnNext.addEventListener('click', (e) => {
      e.stopPropagation();
      goToNextPage();
    });

    // 全屏按钮
    btnFullscreen.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFullscreen();
    });

    // 唤醒控制栏
    document.addEventListener('pointerdown', () => {
      showControlsTemporarily();
    }, { passive: true });

    // 键盘左右箭头支持
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        goToNextPage();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        goToPrevPage();
      }
    });

    // 窗口尺寸变化自适应
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (STATE.mode === 'book') {
          initBookFlip();
          if (pageFlip) pageFlip.turnToPage(STATE.currentPage);
        }
      }, 250);
    });

    // 启动统一手势引擎
    setupUnifiedGestures();

    // 监听系统全屏变化事件（物理返回键、ESC键或系统手势触发退出时同步UI状态）
    const onFsChange = () => {
      const nativeActive = isNativeFullscreen();
      if (!nativeActive && !isWebFullscreen) {
        updateFullscreenUI(false);
      } else if (nativeActive) {
        updateFullscreenUI(true);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    document.addEventListener('mozfullscreenchange', onFsChange);
    document.addEventListener('MSFullscreenChange', onFsChange);
  }

  // 页面加载完成初始化
  window.addEventListener('DOMContentLoaded', () => {
    preloadAllImages();

    // 如果是手机端竖屏或微信内置浏览器，默认进入极简流畅小说平推模式
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      STATE.mode = 'slide';
      document.body.classList.remove('mode-book');
      document.body.classList.add('mode-slide');
      if (modeText) modeText.textContent = '切换为仿真书本';
      if (modeIcon) {
        modeIcon.innerHTML = `
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path fill="currentColor" d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/>
          </svg>
        `;
      }
      updateSlideView(0, false);
      // 延迟确保 WebKit 与微信 WebView 完成布局排版后二次唤醒首屏渲染
      requestAnimationFrame(() => {
        updateSlideView(0, false);
      });
    } else {
      initBookFlip();
    }

    setupEventListeners();
    showControlsTemporarily();
  });

})();
