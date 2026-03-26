/*!
 * π Lab — Page Loading Progress
 * Tracks real resource loading and shows a smooth progress bar
 */
(function () {
    'use strict';

    /* ---------- 注入 HTML 结构 ---------- */
    var loaderEl = document.querySelector('.page-loader');
    if (!loaderEl) return;

    loaderEl.innerHTML = [
        '<div class="pi-loader-bg"></div>',
        '<div class="pi-loader-content">',
        '  <div class="pi-loader-logo">',
        '    <div class="pi-loader-symbol">π</div>',
        '    <div class="pi-loader-title">',
        '      <div class="pi-loader-title-main">Photography &amp; Imaging</div>',
        '      <div class="pi-loader-title-sub">Research Group · Nankai</div>',
        '    </div>',
        '  </div>',
        '  <div class="pi-loader-progress-wrap">',
        '    <div class="pi-loader-meta">',
        '      <span class="pi-loader-percent" id="pi-percent">0%</span>',
        '      <span class="pi-loader-status" id="pi-status">Initializing</span>',
        '    </div>',
        '    <div class="pi-loader-track">',
        '      <div class="pi-loader-fill active" id="pi-fill"></div>',
        '    </div>',
        '  </div>',
        '  <div class="pi-loader-dots">',
        '    <span></span><span></span><span></span><span></span><span></span>',
        '  </div>',
        '</div>'
    ].join('');

    /* ---------- 进度控制 ---------- */
    var fillEl    = document.getElementById('pi-fill');
    var percentEl = document.getElementById('pi-percent');
    var statusEl  = document.getElementById('pi-status');
    var current   = 0;
    var target    = 0;
    var rafId     = null;
    var done      = false;

    var stages = [
        { threshold: 15,  label: 'Loading assets' },
        { threshold: 40,  label: 'Fetching resources' },
        { threshold: 65,  label: 'Rendering layout' },
        { threshold: 85,  label: 'Almost there' },
        { threshold: 100, label: 'Ready' }
    ];

    function getLabel(pct) {
        for (var i = 0; i < stages.length; i++) {
            if (pct <= stages[i].threshold) return stages[i].label;
        }
        return 'Ready';
    }

    function setProgress(pct) {
        target = Math.min(100, Math.max(target, pct));
    }

    function tick() {
        if (current < target) {
            /* 越接近目标越慢，产生缓动感 */
            var step = Math.max(0.3, (target - current) * 0.06);
            current = Math.min(target, current + step);
            var rounded = Math.round(current);
            fillEl.style.width    = current + '%';
            percentEl.textContent = rounded + '%';
            statusEl.textContent  = getLabel(rounded);
        }
        if (!done || current < 100) {
            rafId = requestAnimationFrame(tick);
        }
    }

    /* ---------- 追踪真实资源加载 ---------- */
    /* 方案：用 PerformanceObserver 监听 resource 加载事件，
       同时设置几个时间节点保底推进 */

    var totalResources = 0;
    var loadedResources = 0;

    function onResourceLoaded() {
        loadedResources++;
        if (totalResources > 0) {
            var ratio = loadedResources / totalResources;
            /* 资源加载映射到 20%~90% 区间 */
            setProgress(20 + Math.round(ratio * 70));
        }
    }

    /* 初始快速推进到 10% */
    setProgress(10);
    requestAnimationFrame(function () {
        rafId = requestAnimationFrame(tick);
    });

    /* 用 PerformanceObserver 监听资源 */
    if (typeof PerformanceObserver !== 'undefined') {
        try {
            var observer = new PerformanceObserver(function (list) {
                var entries = list.getEntries();
                totalResources += entries.length;
                for (var i = 0; i < entries.length; i++) {
                    onResourceLoaded();
                }
            });
            observer.observe({ type: 'resource', buffered: true });
        } catch (e) { /* ignore */ }
    }

    /* 时间节点保底推进（防止 PerformanceObserver 不可用时卡住）*/
    setTimeout(function () { setProgress(30); }, 300);
    setTimeout(function () { setProgress(55); }, 700);
    setTimeout(function () { setProgress(75); }, 1200);
    setTimeout(function () { setProgress(88); }, 2000);

    /* ---------- window.load 时完成 ---------- */
    function finish() {
        if (done) return;
        done = true;
        setProgress(100);

        /* 等进度条跑满后再淡出 */
        var checkDone = setInterval(function () {
            if (current >= 99.5) {
                clearInterval(checkDone);
                cancelAnimationFrame(rafId);
                setTimeout(function () {
                    loaderEl.classList.add('fade-out');
                    setTimeout(function () {
                        loaderEl.style.display = 'none';
                    }, 850);
                }, 300);
            }
        }, 50);
    }

    if (document.readyState === 'complete') {
        finish();
    } else {
        window.addEventListener('load', finish);
        /* 最长等待 6 秒后强制完成 */
        setTimeout(finish, 6000);
    }

})();
