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
  const leftHotspot = document.getElementById('leftHotspot');
  const rightHotspot = document.getElementById('rightHotspot');
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
  function updateSlideView(index) {
    slideCards.forEach((card, idx) => {
      card.classList.remove('active', 'prev');
      if (idx === index) {
        card.classList.add('active');
      } else if (idx < index) {
        card.classList.add('prev');
      }
    });
  }

  // ============================================================
  // 4. 全局手势交互引擎 (涵盖 仿真书本 + 小说平推 双模式)
  // ============================================================
  function setupUnifiedGestures() {
    const stage = document.getElementById('bookStage');
    if (!stage) return;

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let isTracking = false;

    const onTouchStart = (e) => {
      // 忽略多指缩放与点击交互按钮
      if (e.touches.length !== 1) {
        isTracking = false;
        return;
      }
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startTime = Date.now();
      isTracking = true;
    };

    const onTouchEnd = (e) => {
      if (!isTracking) return;
      isTracking = false;

      if (!e.changedTouches || e.changedTouches.length === 0) return;
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      const deltaTime = Date.now() - startTime;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      // 1. 判断是否为水平滑动手势 (Swipe: 水平滑动 > 35px 且倾角合理)
      if (absX > 35 && absY < absX * 1.5 && deltaTime < 800) {
        if (deltaX < 0) {
          // 向左划 ➔ 下一页
          goToNextPage();
        } else {
          // 向右划 ➔ 上一页
          goToPrevPage();
        }
        return;
      }

      // 2. 判断是否为快速轻点屏幕 (Tap: 移动 < 12px 且时间 < 300ms)
      if (absX < 12 && absY < 12 && deltaTime < 350) {
        const screenW = window.innerWidth;
        const clickX = touch.clientX;

        // 点击屏幕右侧 55% ➔ 下一页
        if (clickX > screenW * 0.45) {
          goToNextPage();
        } else {
          // 点击屏幕左侧 45% ➔ 上一页
          goToPrevPage();
        }
      }
    };

    stage.addEventListener('touchstart', onTouchStart, { passive: true });
    stage.addEventListener('touchend', onTouchEnd, { passive: true });
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
  // 7. 控制栏沉浸式自动隐藏与全屏
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

  function toggleFullscreen() {
    const doc = window.document;
    const docEl = doc.documentElement;
    const requestFs = docEl.requestFullscreen || docEl.mozRequestFullScreen || docEl.webkitRequestFullScreen || docEl.msRequestFullscreen;
    const cancelFs = doc.exitFullscreen || doc.mozCancelFullScreen || doc.webkitExitFullscreen || doc.msExitFullscreen;

    if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
      if (requestFs) requestFs.call(docEl);
    } else {
      if (cancelFs) cancelFs.call(doc);
    }
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

    // 左右热区（支持 click 与 touchend，防止移动端事件丢失）
    const handleHotspot = (fn) => (e) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    };

    leftHotspot.addEventListener('click', handleHotspot(goToPrevPage));
    rightHotspot.addEventListener('click', handleHotspot(goToNextPage));

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
  }

  // 页面加载完成初始化
  window.addEventListener('DOMContentLoaded', () => {
    initBookFlip();
    setupEventListeners();
    showControlsTemporarily();
  });

})();
