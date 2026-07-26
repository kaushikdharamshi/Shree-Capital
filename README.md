# Shree Capital Credit Co-operative Society Ltd. — Website

Static marketing website for Shree Capital Credit Co-operative Society Ltd., Jodhpur.
Built with plain HTML, CSS and vanilla JavaScript — no build step, no dependencies.

## Products covered

**1. Deposits**
- Fixed Deposit (FD)
- Monthly Income Scheme (MIS)
- Recurring Deposit (RD)

**2. Loans**
- Group Loan
- Individual Loan (including loan against FD)

## What the JavaScript does

| Feature | File |
| --- | --- |
| Hero carousel (autoplay, arrows, dots, swipe) | `assets/js/main.js` |
| Sticky header, mobile drawer, products mega-menu | `assets/js/main.js` |
| Product & calculator tabs, deep links (`#mis`, `#group-loan`) | `assets/js/main.js` |
| Deposit / loan rate switcher | `assets/js/main.js` |
| FAQ accordion, scroll reveal, animated counters, scroll spy | `assets/js/main.js` |
| Enquiry form validation + email / WhatsApp handoff | `assets/js/main.js` |
| EMI, FD, RD, MIS and loan-eligibility maths | `assets/js/calculators.js` |

All calculations run in the browser. Nothing is sent to a server.

## Run locally

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Structure

```
index.html
assets/
  css/styles.css
  js/main.js
  js/calculators.js
  img/            logo and photography extracted from the brand collateral
```

## Editing content

- **Interest rates** — the rate cards live in the `#rates` tables in `index.html`;
  the headline numbers also appear on the quick cards and in each product's
  "Highlights" panel.
- **Contact details** — phone `7300099621` and the address appear in the top bar,
  contact section and footer. The WhatsApp number is also set as `WA_NUMBER` in
  `assets/js/main.js`.
- **Enquiry form** — it is a static site, so submissions open the visitor's mail
  client or WhatsApp. To collect enquiries server-side, point the form at a form
  service (Formspree, Google Forms) or a small backend.

## Deployment

Published with GitHub Pages from the `main` branch. `.nojekyll` is present so
GitHub serves the `assets/` folder as-is.

## Disclaimer

Interest rates, tenures and limits shown on the site are indicative placeholders
taken from the brand collateral. Confirm the live figures with the society before
publishing to customers.
