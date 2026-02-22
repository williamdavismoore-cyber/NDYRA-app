# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - banner [ref=e2]:
    - generic [ref=e3]:
      - link "NDYRA" [ref=e4] [cursor=pointer]:
        - /url: /
      - navigation [ref=e5]:
        - link "Login" [ref=e6] [cursor=pointer]:
          - /url: /login.html
        - link "Join" [ref=e7] [cursor=pointer]:
          - /url: /join.html
  - main [ref=e8]:
    - heading "Quick Join" [level=1] [ref=e9]
    - paragraph [ref=e10]: Account → Waiver → Payment → Confirmation
    - paragraph [ref=e12]:
      - text: "Tip: add"
      - code [ref=e13]: "?src=demo"
      - text: to run this page without Supabase while you're wiring the backend.
  - contentinfo [ref=e14]:
    - generic [ref=e16]:
      - generic [ref=e17]:
        - strong [ref=e18]: NDYRA
        - generic [ref=e19]: Build preview (CP36)
      - link "build.json" [ref=e21] [cursor=pointer]:
        - /url: /assets/build.json
```