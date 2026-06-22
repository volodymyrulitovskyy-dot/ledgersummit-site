/* ============================================
   LEDGER SUMMIT - Shared Scripts
   Used across all static pages
   ============================================ */

function normalizeLedgerSummitPath(pathname) {
  return pathname.replace(/\/+$/, '') || '/';
}

(function applyStaleCaseStudyGuard() {
  const currentPath = normalizeLedgerSummitPath(window.location.pathname);
  const guardedPaths = new Set([
    '/blog/netsuite-api-integration-automation',
    '/blog/netsuite-multi-entity-migration'
  ]);

  if (!guardedPaths.has(currentPath)) {
    return;
  }

  const style = document.createElement('style');
  style.setAttribute('data-ledger-summit-fix', 'stale-case-study-guard');
  style.textContent = [
    '.cs-screenshot { display: none !important; }',
    'img[src*="project-eac-dashboard"], img[src*="financial-reporting-dashboard"] { display: none !important; }'
  ].join('\n');
  document.head.appendChild(style);
})();

document.addEventListener('DOMContentLoaded', () => {
  const currentPath = normalizeLedgerSummitPath(window.location.pathname);

  const initToolsCatalogueSearch = () => {
    const input = document.querySelector('[data-tools-search]');
    const count = document.querySelector('[data-tools-search-count]');
    const cards = Array.from(document.querySelectorAll('#tool-library .tools-library-card'));

    if (!input || cards.length === 0) {
      return;
    }

    const toolCards = cards.filter((card) => {
      const href = card.getAttribute('href') || '';
      return href.startsWith('/tools/');
    });

    const getSearchText = (card) => [
      card.querySelector('h3')?.textContent || '',
      card.querySelector('p')?.textContent || '',
      card.querySelector('.tools-library-badge')?.textContent || ''
    ].join(' ').toLowerCase();

    const update = () => {
      const query = input.value.trim().toLowerCase();
      let visibleTools = 0;

      cards.forEach((card) => {
        const href = card.getAttribute('href') || '';
        const isToolCard = href.startsWith('/tools/');
        const matches = !query || getSearchText(card).includes(query);

        card.hidden = query ? !matches : false;
        if (isToolCard && !card.hidden) {
          visibleTools += 1;
        }
      });

      if (count) {
        count.textContent = query ? visibleTools + ' matching tool' + (visibleTools === 1 ? '' : 's') : toolCards.length + ' tools available';
      }
    };

    input.addEventListener('input', update);
    update();
  };

  initToolsCatalogueSearch();

  const replaceRemovedScreenshot = (html) => {
    const screenshot = document.querySelector('.cs-screenshot');
    if (!screenshot || !screenshot.parentNode) {
      return;
    }

    const replacement = document.createElement('div');
    replacement.className = 'cs-narrative reveal visible';
    replacement.innerHTML = html;
    screenshot.parentNode.insertBefore(replacement, screenshot);
    screenshot.remove();
  };

  const syncCaseStudyByline = () => {
    const bylineName = document.querySelector('.cs-byline-info strong');
    if (bylineName) {
      bylineName.textContent = 'Vlad Ulitovskiy, MBA, CPA';
    }

    const bylineTitle = document.querySelector('.cs-byline-info span');
    if (bylineTitle) {
      bylineTitle.textContent = 'Accounting & Compliance Lead';
    }

    const bylinePhoto = document.querySelector('.cs-byline-photo');
    if (bylinePhoto) {
      bylinePhoto.src = '/img/team/vlad-ulitovskiy-20260502.jpg';
      bylinePhoto.alt = 'Vlad Ulitovskiy';
    }

    const authorHeading = document.querySelector('.cs-about-author-body h3');
    if (authorHeading) {
      authorHeading.textContent = 'Vlad Ulitovskiy, MBA, CPA';
    }

    const authorTitle = document.querySelector('.cs-about-author-title');
    if (authorTitle) {
      authorTitle.textContent = 'Accounting & Compliance Lead at Ledger Summit';
    }

    const authorPhoto = document.querySelector('.cs-about-author-photo');
    if (authorPhoto) {
      authorPhoto.src = '/img/team/vlad-ulitovskiy-20260502.jpg';
      authorPhoto.alt = 'Vlad Ulitovskiy';
    }
  };

  if (currentPath === '/blog/netsuite-multi-entity-migration') {
    replaceRemovedScreenshot(
      '<p class="cs-lead">The target state was not a dashboard. It was a controlled operating model in which five subsidiaries, one elimination framework, and four years of source history all lived inside the same NetSuite architecture.</p>' +
      '<p>Practically, that meant one shared subsidiary structure, one standardized chart and dimensional model, one intercompany rules framework, and one document-level history layer that finance could drill through after go-live. Consolidated reporting became usable because the accounting relationships were rebuilt correctly, not because a reporting screen was layered on top.</p>'
    );
    syncCaseStudyByline();
  }

  if (currentPath === '/blog/netsuite-api-integration-automation') {
    replaceRemovedScreenshot(
      '<p class="cs-lead">The operating model was built around accounting execution, not around a presentation layer. Every integration existed to move approved source data into NetSuite with posting control, support, and auditability intact.</p>' +
      '<p>Payroll, time, project, AP, and close-support schedules all followed the same pattern: source systems exposed approved data through API bridges, SuiteScript normalized the payloads, NetSuite posted the resulting journals or transactions, and finance reviewed exception queues instead of rebuilding balances in spreadsheets.</p>'
    );
    syncCaseStudyByline();
  }

  // ---- Canonical Blog Host Rewrite ----
  const legacyBlogOrigin = 'https://blog.ledgersummit.com';
  const canonicalBlogOrigin = 'https://ledgersummit.com/blog';

  document.querySelectorAll('a[href^="' + legacyBlogOrigin + '"]').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href) return;

    const suffix = href.slice(legacyBlogOrigin.length).replace(/^\/+/, '');
    const nextHref = suffix ? canonicalBlogOrigin + '/' + suffix : canonicalBlogOrigin + '/';
    link.setAttribute('href', nextHref);
  });

  // ---- Scroll Reveal Animations ----
  const revealEls = document.querySelectorAll('.reveal, .reveal-left, .reveal-right');

  const observerOptions = {
    threshold: 0.12,
    rootMargin: '0px 0px -40px 0px'
  };

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        return;
      }

      const parent = entry.target.parentElement;
      const siblings = parent ? Array.from(parent.querySelectorAll('.reveal, .reveal-left, .reveal-right')) : [];
      const idx = siblings.indexOf(entry.target);
      const delay = idx >= 0 ? idx * 80 : 0;

      setTimeout(() => {
        entry.target.classList.add('visible');
      }, delay);

      revealObserver.unobserve(entry.target);
    });
  }, observerOptions);

  revealEls.forEach((el) => revealObserver.observe(el));

  // ---- Sticky Nav with Background ----
  const nav = document.getElementById('nav');

  const handleScroll = () => {
    if (!nav) {
      return;
    }

    if (window.scrollY > 50) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();

  // ---- Mobile Navigation ----
  const hamburger = document.getElementById('hamburger');
  const mobileNav = document.getElementById('mobileNav');

  if (hamburger && mobileNav) {
    hamburger.addEventListener('click', () => {
      const isOpen = mobileNav.classList.toggle('open');
      hamburger.classList.toggle('active');
      hamburger.setAttribute('aria-expanded', String(isOpen));
      mobileNav.setAttribute('aria-hidden', String(!isOpen));
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });
  }

  window.closeMobileNav = function closeMobileNav() {
    if (mobileNav && hamburger) {
      mobileNav.classList.remove('open');
      hamburger.classList.remove('active');
      hamburger.setAttribute('aria-expanded', 'false');
      mobileNav.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }
  };

  // ---- Smooth Scroll for Anchor Links ----
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href');
      if (targetId === '#') return;

      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        const navHeight = nav ? nav.offsetHeight : 0;
        const targetPos = target.getBoundingClientRect().top + window.pageYOffset - navHeight - 20;

        window.scrollTo({
          top: targetPos,
          behavior: 'smooth'
        });

        if (typeof closeMobileNav === 'function') closeMobileNav();
      }
    });
  });

  // ---- FAQ Accordion (if present) ----
  const bindFaqAccordion = (itemSelector, buttonSelector, answerSelector) => {
    const faqItems = document.querySelectorAll(itemSelector);

    faqItems.forEach((item) => {
      const btn = item.querySelector(buttonSelector);
      const answer = item.querySelector(answerSelector);

      if (!btn || !answer || btn.dataset.faqBound === 'true') {
        return;
      }

      btn.dataset.faqBound = 'true';
      btn.setAttribute('aria-expanded', item.classList.contains('open') ? 'true' : 'false');
      answer.style.maxHeight = item.classList.contains('open') ? answer.scrollHeight + 'px' : '0';

      btn.addEventListener('click', () => {
        const isOpen = item.classList.contains('open');
        const faqGroup = item.closest('.faq-list, .faq-section, .cs-faq, .cs-faq-section') || document;
        const groupItems = faqGroup.querySelectorAll(itemSelector);

        groupItems.forEach((other) => {
          if (other !== item) {
            other.classList.remove('open');
            const otherAnswer = other.querySelector(answerSelector);
            const otherBtn = other.querySelector(buttonSelector);
            if (otherAnswer) otherAnswer.style.maxHeight = '0';
            if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
          }
        });

        if (isOpen) {
          item.classList.remove('open');
          answer.style.maxHeight = '0';
          btn.setAttribute('aria-expanded', 'false');
        } else {
          item.classList.add('open');
          answer.style.maxHeight = answer.scrollHeight + 'px';
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });
  };

  bindFaqAccordion('.faq-item', '.faq-question', '.faq-answer');
  bindFaqAccordion('.cs-faq-item', '.cs-faq-q', '.cs-faq-a');

  // ---- Scroll to Top Button ----
  const scrollTopBtn = document.getElementById('scrollTopBtn');
  if (scrollTopBtn) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 500) {
        scrollTopBtn.classList.add('visible');
      } else {
        scrollTopBtn.classList.remove('visible');
      }
    }, { passive: true });

    scrollTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ---- Active Nav Link Highlighting ----
  document.querySelectorAll('.nav-links a, .mobile-nav a').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#')) return;

    const linkPath = normalizeLedgerSummitPath(new URL(href, window.location.origin).pathname);
    if (linkPath === currentPath) {
      link.classList.add('active');
    }
  });
});
