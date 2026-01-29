/**
 * 通用拖拽辅助插件（Xiaoxin 版）
 * - 基于酒馆助手文档 /mobile/drag-helper.js 改造
 * - 兼容 PC 和 移动端
 * - 支持拖拽手柄、长按触发、边界限制
 * - 额外增加 onDragStart / onDragEnd 回调，方便外部保存位置
 */

class DragHelper {
  constructor(element, options = {}) {
    this.element = element;
    this.options = {
      boundary: document.body, // 拖拽边界
      clickThreshold: 5, // 移动距离阈值，小于此值视为点击
      doubleClickDelay: 300, // 双击判定时间间隔（毫秒）
      dragClass: 'dragging', // 拖拽时添加的 CSS 类
      savePosition: true, // 是否使用本工具自带的 localStorage 持久化
      storageKey: 'drag-position', // localStorage 键名
      touchTimeout: 200, // 触摸超时时间（毫秒），超过此时间且未移动则视为长按开始拖拽
      dragHandle: null, // 拖拽手柄选择器，如果指定则只有该元素可以拖拽
      onDragStart: null, // 拖拽开始回调 (position: { x, y })
      onDragEnd: null, // 拖拽结束回调 (position: { x, y })
      onDoubleClick: null, // 双击回调 (context: { event, element })
      ...options,
    };

    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;
    this.startElementX = 0;
    this.startElementY = 0;
    this.moved = false;
    this.startTime = 0;
    this.touchTimer = null;
    this.lastTapTime = 0; // 上一次点击/轻触时间，用于双击判定

    this.init();
  }

  init() {
    // 设置元素为可拖拽
    const computedPosition = window.getComputedStyle(this.element).position;
    // 如果当前是 static，则改为 fixed；否则尊重原来的 position（如 fixed/absolute）
    if (computedPosition === 'static') {
      this.element.style.position = 'fixed';
    }

    this.element.style.cursor = this.element.style.cursor || 'move';
    this.element.style.userSelect = 'none';
    this.element.style.webkitUserSelect = 'none';
    this.element.style.mozUserSelect = 'none';
    this.element.style.msUserSelect = 'none';

    // 加载保存的位置（如果启用内置持久化）
    if (this.options.savePosition) {
      this.loadPosition();
    }

    // 绑定事件
    this.bindEvents();
  }

  bindEvents() {
    // 确定事件绑定的目标元素
    const eventTarget = this.options.dragHandle
      ? this.element.querySelector(this.options.dragHandle)
      : this.element;

    if (!eventTarget) {
      console.warn('DragHelper: 拖拽手柄元素未找到:', this.options.dragHandle);
      return;
    }

    // 预绑定实例方法，便于后续 removeEventListener
    this._boundHandleStart = this.handleStart.bind(this);
    this._boundHandleMove = this.handleMove.bind(this);
    this._boundHandleEnd = this.handleEnd.bind(this);

    // PC 端事件
    eventTarget.addEventListener('mousedown', this._boundHandleStart, {
      passive: false,
    });
    document.addEventListener('mousemove', this._boundHandleMove, {
      passive: false,
    });
    document.addEventListener('mouseup', this._boundHandleEnd, {
      passive: false,
    });

    // 移动端事件
    eventTarget.addEventListener('touchstart', this._boundHandleStart, {
      passive: false,
    });
    document.addEventListener('touchmove', this._boundHandleMove, {
      passive: false,
    });
    document.addEventListener('touchend', this._boundHandleEnd, {
      passive: false,
    });

    // 防止拖拽时的默认行为
    this._boundDragStartPrevent = (e) => e.preventDefault();
    eventTarget.addEventListener('dragstart', this._boundDragStartPrevent);

    // 鼠标端额外监听 dblclick，确保双击判定足够稳定
    if (typeof this.options.onDoubleClick === 'function') {
      this._boundDblClick = (e) => {
        try {
          e.preventDefault();
          e.stopPropagation();
        } catch (_) {
          // 防御性忽略错误
        }
        try {
          this.options.onDoubleClick({
            event: e,
            element: this.element,
          });
        } catch (error) {
          console.warn('DragHelper dblclick onDoubleClick 回调执行失败:', error);
        }
      };
      eventTarget.addEventListener('dblclick', this._boundDblClick, {
        passive: false,
      });
    }

    // 保存事件目标以便后续销毁
    this.eventTarget = eventTarget;
  }

  handleStart(e) {
    // 如果指定了拖拽手柄，检查是否在手柄上开始拖拽
    if (this.options.dragHandle) {
      const handleElement = this.element.querySelector(this.options.dragHandle);
      if (handleElement && !handleElement.contains(e.target)) {
        return; // 不在拖拽手柄上，忽略事件
      }
    }

    const event = e.type.startsWith('touch') ? e.touches[0] : e;

    this.isDragging = true;
    this.moved = false;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.startTime = Date.now();

    const rect = this.element.getBoundingClientRect();
    this.startElementX = rect.left;
    this.startElementY = rect.top;

    // 清除之前的定时器
    if (this.touchTimer) {
      clearTimeout(this.touchTimer);
      this.touchTimer = null;
    }

    // 只对 PC 端鼠标事件立即开始拖拽
    if (e.type === 'mousedown') {
      e.preventDefault();
      this.element.classList.add(this.options.dragClass);
      this.element.style.zIndex = this.element.style.zIndex || '9999';
    } else if (e.type === 'touchstart') {
      // 触摸事件延迟处理，给点击事件一个机会
      this.touchTimer = setTimeout(() => {
        if (this.isDragging && !this.moved) {
          this.element.classList.add(this.options.dragClass);
          this.element.style.zIndex = this.element.style.zIndex || '9999';
        }
      }, this.options.touchTimeout);
    }
  }

  handleMove(e) {
    if (!this.isDragging) return;

    const event = e.type.startsWith('touch') ? e.touches[0] : e;

    const deltaX = event.clientX - this.startX;
    const deltaY = event.clientY - this.startY;

    // 检查是否移动超过阈值
    if (
      !this.moved &&
      (Math.abs(deltaX) > this.options.clickThreshold ||
        Math.abs(deltaY) > this.options.clickThreshold)
    ) {
      this.moved = true;
      // 确认开始拖拽，添加视觉反馈并阻止默认行为
      e.preventDefault();
      this.element.classList.add(this.options.dragClass);
      this.element.style.zIndex = this.element.style.zIndex || '9999';

      // 清除触摸定时器
      if (this.touchTimer) {
        clearTimeout(this.touchTimer);
        this.touchTimer = null;
      }

      // 回调：拖拽开始
      if (typeof this.options.onDragStart === 'function') {
        const rect = this.element.getBoundingClientRect();
        this.options.onDragStart({ x: rect.left, y: rect.top });
      }
    }

    if (this.moved) {
      // 继续阻止默认行为以避免滚动等干扰
      e.preventDefault();

      const newX = this.startElementX + deltaX;
      const newY = this.startElementY + deltaY;

      // 边界检查
      const boundedPosition = this.constrainToBoundary(newX, newY);

      this.element.style.left = `${boundedPosition.x}px`;
      this.element.style.top = `${boundedPosition.y}px`;
    }
  }

  handleEnd(e) {
    if (!this.isDragging) return;

    // 清除触摸定时器
    if (this.touchTimer) {
      clearTimeout(this.touchTimer);
      this.touchTimer = null;
    }

    this.isDragging = false;
    this.element.classList.remove(this.options.dragClass);

    const now = Date.now();

    // 如果没有移动超过阈值，则视为点击 / 轻触，额外支持双击判定
    if (!this.moved) {
      this.element.style.zIndex = ''; // 恢复原始 z-index

      let isDoubleClick = false;
      if (now - this.lastTapTime < this.options.doubleClickDelay) {
        isDoubleClick = true;
        this.lastTapTime = 0;
      } else {
        this.lastTapTime = now;
      }

      // 处理双击回调（包括鼠标双击和触摸双击）
      if (isDoubleClick && typeof this.options.onDoubleClick === 'function') {
        try {
          e.preventDefault();
          e.stopPropagation();
        } catch (_) {
          // 忽略防御性错误
        }
        try {
          this.options.onDoubleClick({
            event: e,
            element: this.element,
          });
        } catch (error) {
          console.warn('DragHelper onDoubleClick 回调执行失败:', error);
        }
        return;
      }

      // 对于触摸事件，如果时间很短且没有移动，确保点击事件能正常触发
      if (e.type === 'touchend') {
        const touchDuration = now - this.startTime;
        if (touchDuration < this.options.touchTimeout) {
          // 短触摸，让点击事件正常执行
          return;
        }
      }

      return;
    }

    // 保存位置（仅当启用内置持久化时）
    if (this.options.savePosition && this.moved) {
      this.savePosition();
    }

    // 回调：拖拽结束
    if (typeof this.options.onDragEnd === 'function') {
      try {
        const rect = this.element.getBoundingClientRect();
        this.options.onDragEnd({ x: rect.left, y: rect.top });
      } catch (error) {
        console.warn('DragHelper onDragEnd 回调执行失败:', error);
      }
    }

    // 延迟恢复 z-index，确保拖拽动画完成
    setTimeout(() => {
      this.element.style.zIndex = '';
    }, 100);

    // 如果移动了，阻止后续的点击事件
    if (this.moved) {
      const preventClick = (event) => {
        event.stopPropagation();
        event.preventDefault();
        this.element.removeEventListener('click', preventClick, true);
      };
      this.element.addEventListener('click', preventClick, true);
    }
  }

  constrainToBoundary(x, y) {
    const boundary = this.options.boundary;
    const elementRect = this.element.getBoundingClientRect();
    const boundaryRect = boundary.getBoundingClientRect();

    // 计算边界
    const minX = boundaryRect.left;
    const minY = boundaryRect.top;
    const maxX = boundaryRect.right - elementRect.width;
    const maxY = boundaryRect.bottom - elementRect.height;

    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    };
  }

  savePosition() {
    if (!this.options.savePosition) return;

    const rect = this.element.getBoundingClientRect();
    const position = {
      left: rect.left,
      top: rect.top,
    };

    try {
      localStorage.setItem(this.options.storageKey, JSON.stringify(position));
    } catch (error) {
      console.warn('DragHelper 无法保存拖拽位置:', error);
    }
  }

  loadPosition() {
    if (!this.options.savePosition) return;

    try {
      const saved = localStorage.getItem(this.options.storageKey);
      if (saved) {
        const position = JSON.parse(saved);

        // 验证位置是否仍然有效
        const boundedPosition = this.constrainToBoundary(
          position.left,
          position.top,
        );

        this.element.style.left = `${boundedPosition.x}px`;
        this.element.style.top = `${boundedPosition.y}px`;
      }
    } catch (error) {
      console.warn('DragHelper 无法加载拖拽位置:', error);
    }
  }

  // 销毁拖拽功能
  destroy() {
    // 清除定时器
    if (this.touchTimer) {
      clearTimeout(this.touchTimer);
      this.touchTimer = null;
    }

    // 使用保存的事件目标进行清理
    const target = this.eventTarget || this.element;

    if (target && this._boundHandleStart) {
      target.removeEventListener('mousedown', this._boundHandleStart);
      target.removeEventListener('touchstart', this._boundHandleStart);
      target.removeEventListener('dragstart', this._boundDragStartPrevent);
      if (this._boundDblClick) {
        target.removeEventListener('dblclick', this._boundDblClick);
      }
    }

    if (this._boundHandleMove) {
      document.removeEventListener('mousemove', this._boundHandleMove);
      document.removeEventListener('touchmove', this._boundHandleMove);
    }

    if (this._boundHandleEnd) {
      document.removeEventListener('mouseup', this._boundHandleEnd);
      document.removeEventListener('touchend', this._boundHandleEnd);
    }

    this.element.style.cursor = '';
    this.element.classList.remove(this.options.dragClass);
    this.element.style.zIndex = '';

    this.eventTarget = null;
    this._boundHandleStart = null;
    this._boundHandleMove = null;
    this._boundHandleEnd = null;
    this._boundDragStartPrevent = null;
    this._boundDblClick = null;
  }

  // 静态方法：为元素快速添加拖拽功能
  static makeDraggable(element, options = {}) {
    return new DragHelper(element, options);
  }
}

// 导出到全局作用域
window.DragHelper = DragHelper;


