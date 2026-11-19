# Final presentation (10 minutes) and reflection

## Slide plan
1. **Problem (1 min):** teams need project management, but each company's data must be completely separate, and the product must make money (plans and limits).
2. **Design (2.5 min):** the system diagram; **tenant isolation in layers** (the sequence diagram: 404 for outsiders, scoped queries, scoped references); the permission matrix.
3. **Live demo (4 min):**
   - Log in as Priya (Acme), drag a card, open an issue, add a comment, create a custom workflow rule and try to break it.
   - Log in as Vik (viewer): read-only.
   - Log in as Sam (Globex), open Acme's URL: "not a member".
   - As Sam, hit the Free plan limit, then upgrade with the simulated checkout.
   - Show a webhook delivery (the signed request) and the activity log; generate a report.
4. **Challenges (1 min):** pick two real ones. Good ones from this project: keeping card order correct after many drops; making webhooks reliable without slowing the user's request; proving isolation with tests.
5. **Results (1 min):** 112 automated tests and the real-worker check, CI pipeline, Docker stack.
6. **Next steps (0.5 min):** PostgreSQL row-level security, real Stripe, SMTP, burndown charts.

## Questions you should be able to answer
- What is "shared schema with tenant_id"? What are the alternatives (schema per tenant, database per tenant) and the trade-offs?
- Why does an outsider get **404** and not 403?
- Name the layers that stop one company reading another's data. What would still be a risk? (a new endpoint that forgets `TenantMixin`; the answer is row-level security.)
- How can you create an issue that points at another company's project? (You cannot: related fields are scoped to the workspace.)
- How are card positions stored, and what happens after many inserts between two cards?
- What is a webhook signature and how does the receiver verify it? Why are deliveries done in Celery after the transaction commits?
- What does HTTP 402 mean here, and how does the UI use it?
- Why is billing simulated? What exactly would change to use real Stripe? (Set `STRIPE_SECRET_KEY`; the activation code after payment is shared and tested.)
- What does the GitHub Actions pipeline do, step by step?

## Reflection: be accurate
Write what is true, in your own words:
- **What you owned:** the scope decisions (what to cut in 7 days), setting up and running the stack, testing the app by hand, finding problems, the demo and presentation.
- **How you worked:** you used an AI assistant to write most of the code and to explain it, then ran it, tested it and learned from it. Say so plainly.
- **What you learned:** pick things you can genuinely explain (multi-tenancy, role-based permissions, background jobs, signed webhooks, plan limits).
- **Gaps you were upfront about:** simulated billing (no Stripe account), and which parts could not be run in the build environment.
- **What you would do next.**
Do not claim you hand-wrote code you did not. The honest version is just as strong if you can explain how it works.
