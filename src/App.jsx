import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  Cpu, 
  ShieldCheck, 
  ArrowRight, 
  Sparkles, 
  Github, 
  ExternalLink,
  Layers,
  Sun,
  Moon,
  Send,
  CheckCircle2,
  Mail
} from 'lucide-react';

export default function App() {
  const [ctaClicked, setCtaClicked] = useState(false);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('app-theme') || 'dark';
  });

  const [contactForm, setContactForm] = useState({ name: '', email: '', message: '' });
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('app-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleContactSubmit = (e) => {
    e.preventDefault();
    if (!contactForm.name || !contactForm.email || !contactForm.message) return;
    setFormSubmitting(true);
    setTimeout(() => {
      setFormSubmitting(false);
      setFormSubmitted(true);
      setContactForm({ name: '', email: '', message: '' });
    }, 600);
  };

  return (
    <div className="app-wrapper">
      {/* Ambient Lighting Gradients */}
      <div className="ambient-glow-1"></div>
      <div className="ambient-glow-2"></div>

      {/* Navbar */}
      <nav className="navbar">
        <div className="container nav-container">
          <a href="#" className="logo">
            <div className="logo-badge">
              <Layers size={20} />
            </div>
            <span>ETH</span>
          </a>
          <ul className="nav-links">
            <li><a href="#features">Features</a></li>
            <li><a href="#preview">Platform</a></li>
            <li><a href="#contact">Contact</a></li>
            <li><a href="https://github.com/vishaletheories/TestApp" target="_blank" rel="noreferrer">GitHub</a></li>
          </ul>
          <div className="nav-actions">
            <button 
              className="theme-toggle-btn" 
              onClick={toggleTheme} 
              aria-label="Toggle theme"
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
            >
              {theme === 'dark' ? <Sun size={18} color="#f59e0b" /> : <Moon size={18} color="#6366f1" />}
            </button>
            <a href="#contact" className="nav-cta">
              Get In Touch
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero">
        <div className="container">
          <div className="hero-badge">
            <Sparkles size={14} color="#818cf8" />
            <span>Built autonomously from Notion Specification</span>
          </div>

          <h1 className="hero-title">
            The Autonomous Engine for <br />
            <span className="gradient-text">Modern Engineering Teams</span>
          </h1>

          <p className="hero-subtitle">
            Bridge product brainstorming in Notion directly to autonomous code execution,
            automated test runs, and instantaneous pull requests.
          </p>

          <div className="hero-actions">
            <button 
              className="btn-primary" 
              onClick={() => setCtaClicked(true)}
            >
              <span>{ctaClicked ? "Pipeline Verified! 🚀" : "Start Building"}</span>
              <ArrowRight size={18} />
            </button>
            <a 
              href="https://github.com/vishaletheories/TestApp" 
              target="_blank" 
              rel="noreferrer" 
              className="btn-secondary"
            >
              <Github size={18} />
              <span>View Repository</span>
            </a>
          </div>

          {/* Interactive Live Preview Box */}
          <div className="hero-preview" id="preview">
            <div className="preview-header">
              <div className="preview-dot dot-red"></div>
              <div className="preview-dot dot-yellow"></div>
              <div className="preview-dot dot-green"></div>
              <span style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: '8px' }}>
                notion-to-antigravity-pipeline-active
              </span>
            </div>
            <div className="preview-content">
              <div className="preview-stat">
                <div className="preview-number">100%</div>
                <div className="preview-label">Notion Sync Precision</div>
              </div>
              <div className="preview-stat">
                <div className="preview-number">&lt; 15s</div>
                <div className="preview-label">Ticket to Code Time</div>
              </div>
              <div className="preview-stat">
                <div className="preview-number">0 Errors</div>
                <div className="preview-label">Continuous Test Passing</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section (3 cards matching Notion requirements) */}
      <section className="features-section" id="features">
        <div className="container">
          <div className="section-header">
            <span className="section-badge">Core Capabilities</span>
            <h2 className="section-title">Designed for Developer Speed</h2>
            <p className="section-desc">
              Three unified pillars turning Notion documents into production-ready software.
            </p>
          </div>

          <div className="features-grid">
            {/* Card 1 */}
            <div className="feature-card">
              <div className="feature-icon-wrapper icon-blue">
                <Cpu size={28} />
              </div>
              <h3 className="feature-title">Notion Brain Connection</h3>
              <p className="feature-desc">
                Direct MCP protocol connection querying specs, architecture diagrams, and tickets in real time.
              </p>
            </div>

            {/* Card 2 */}
            <div className="feature-card">
              <div className="feature-icon-wrapper icon-purple">
                <Zap size={28} />
              </div>
              <h3 className="feature-title">Autonomous Code Generation</h3>
              <p className="feature-desc">
                Converts product acceptance criteria into fully styled, typed components with modern responsive design.
              </p>
            </div>

            {/* Card 3 */}
            <div className="feature-card">
              <div className="feature-icon-wrapper icon-cyan">
                <ShieldCheck size={28} />
              </div>
              <h3 className="feature-title">Automated GitHub CI/CD</h3>
              <p className="feature-desc">
                Creates isolated feature branches, commits clean code, pushes to GitHub, and updates Notion automatically.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Form Section (Notion Ticket: Add Simple Contact Form Section) */}
      <section className="contact-section" id="contact">
        <div className="container contact-wrapper">
          <div className="section-header">
            <span className="section-badge">Contact Us</span>
            <h2 className="section-title">Send Us a Message</h2>
            <p className="section-desc">
              Have a question or looking to build with us? Fill out the form below.
            </p>
          </div>

          <div className="contact-card">
            {formSubmitted ? (
              <div className="submit-success-box">
                <CheckCircle2 size={32} color="#10b981" />
                <div>
                  <h4 style={{ fontWeight: 700, marginBottom: '4px', color: 'var(--text-main)' }}>
                    Message Sent Successfully!
                  </h4>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    Thank you! Our engineering team will review your message and reply soon.
                  </p>
                  <button 
                    onClick={() => setFormSubmitted(false)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--primary)',
                      cursor: 'pointer',
                      fontWeight: 600,
                      marginTop: '8px',
                      padding: 0,
                      textDecoration: 'underline'
                    }}
                  >
                    Send another message
                  </button>
                </div>
              </div>
            ) : (
              <form className="contact-form" onSubmit={handleContactSubmit}>
                <div className="form-group">
                  <label className="form-label" htmlFor="contact-name">Full Name</label>
                  <input 
                    type="text" 
                    id="contact-name" 
                    className="form-input" 
                    placeholder="Jane Doe"
                    required
                    value={contactForm.name}
                    onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="contact-email">Email Address</label>
                  <input 
                    type="email" 
                    id="contact-email" 
                    className="form-input" 
                    placeholder="jane@example.com"
                    required
                    value={contactForm.email}
                    onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="contact-message">Message</label>
                  <textarea 
                    id="contact-message" 
                    className="form-textarea" 
                    placeholder="Tell us about your project requirements..."
                    rows={4}
                    required
                    value={contactForm.message}
                    onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                  ></textarea>
                </div>

                <button 
                  type="submit" 
                  className="btn-submit"
                  disabled={formSubmitting}
                >
                  <Send size={18} />
                  <span>{formSubmitting ? "Sending..." : "Send Message"}</span>
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div className="logo">
              <div className="logo-badge">
                <Layers size={18} />
              </div>
              <span>ETH</span>
            </div>
            <ul className="footer-links">
              <li><a href="#features">Features</a></li>
              <li><a href="#contact">Contact</a></li>
              <li><a href="https://github.com/vishaletheories/TestApp" target="_blank" rel="noreferrer">GitHub</a></li>
            </ul>
          </div>
          <div className="footer-bottom">
            <p>&copy; {new Date().getFullYear()} ETH Engine. Built with Notion & Antigravity IDE.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

