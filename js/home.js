/* ============================================
   LEDGER SUMMIT — Home Page Scripts
   Particles, dashboard counters, review carousel
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

    // ---- Animated Counters ----
    const counters = document.querySelectorAll('.counter');

    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                const target = parseInt(el.dataset.target, 10);
                const duration = 1800;
                const startTime = performance.now();

                function easeOutCubic(t) {
                    return 1 - Math.pow(1 - t, 3);
                }

                function animate(now) {
                    const elapsed = now - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    const value = Math.round(easeOutCubic(progress) * target);
                    el.textContent = value;

                    if (progress < 1) {
                        requestAnimationFrame(animate);
                    } else {
                        el.textContent = target;
                    }
                }

                requestAnimationFrame(animate);
                counterObserver.unobserve(el);
            }
        });
    }, { threshold: 0.5 });

    counters.forEach(c => counterObserver.observe(c));


    // ---- Hero Particle Network ----
    const canvas = document.getElementById('heroParticles');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        let w, h, particles;
        const PARTICLE_COUNT = 50;
        const CONNECTION_DIST = 120;

        function resize() {
            const hero = canvas.parentElement;
            w = canvas.width = hero.offsetWidth;
            h = canvas.height = hero.offsetHeight;
        }

        function createParticles() {
            particles = [];
            for (let i = 0; i < PARTICLE_COUNT; i++) {
                particles.push({
                    x: Math.random() * w,
                    y: Math.random() * h,
                    vx: (Math.random() - 0.5) * 0.4,
                    vy: (Math.random() - 0.5) * 0.4,
                    r: Math.random() * 1.5 + 0.5
                });
            }
        }

        function drawParticles() {
            ctx.clearRect(0, 0, w, h);
            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                p.x += p.vx;
                p.y += p.vy;
                if (p.x < 0 || p.x > w) p.vx *= -1;
                if (p.y < 0 || p.y > h) p.vy *= -1;

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(160, 210, 255, 0.55)';
                ctx.fill();

                for (let j = i + 1; j < particles.length; j++) {
                    const q = particles[j];
                    const dx = p.x - q.x;
                    const dy = p.y - q.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < CONNECTION_DIST) {
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(q.x, q.y);
                        ctx.strokeStyle = `rgba(160, 210, 255, ${0.15 * (1 - dist / CONNECTION_DIST)})`;
                        ctx.lineWidth = 0.5;
                        ctx.stroke();
                    }
                }
            }
            requestAnimationFrame(drawParticles);
        }

        resize();
        createParticles();
        drawParticles();
        window.addEventListener('resize', () => { resize(); createParticles(); });
    }


    // ---- Dashboard Metric Counters ----
    const dashNumbers = document.querySelectorAll('.dash-number');
    if (dashNumbers.length) {
        const dashObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const el = entry.target;
                    const target = parseInt(el.dataset.target, 10);
                    const dur = 1500;
                    const start = performance.now();

                    function ease(t) { return 1 - Math.pow(1 - t, 3); }
                    function tick(now) {
                        const p = Math.min((now - start) / dur, 1);
                        el.textContent = Math.round(ease(p) * target);
                        if (p < 1) requestAnimationFrame(tick);
                        else el.textContent = target;
                    }
                    requestAnimationFrame(tick);
                    dashObserver.unobserve(el);
                }
            });
        }, { threshold: 0.3 });
        dashNumbers.forEach(n => dashObserver.observe(n));
    }

});


// ===== Home revision 2026-05-22: Promo bar dismiss =====
(function () {
    var bar = document.getElementById('promoBar');
    var btn = document.getElementById('promoBarClose');
    if (!bar) return;
    try {
        if (localStorage.getItem('ls-promo-dismissed') === '1') {
            bar.classList.add('is-dismissed');
        }
    } catch (e) {}
    if (btn) {
        btn.addEventListener('click', function () {
            bar.classList.add('is-dismissed');
            try { localStorage.setItem('ls-promo-dismissed', '1'); } catch (e) {}
        });
    }
})();
