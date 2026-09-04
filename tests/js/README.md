# JS quality checks (v13.98)

Node harnesses for the content-quality measurement added in v13.98. They load the
AMD modules directly (no Moodle, no browser) and exercise the checks in
`generator.js` against fixtures.

    node tests/js/test-checks.js     # the v13.97.1 pack vs a compliant rewrite
    node tests/js/test-routes.js     # all five routes: specs and floors must agree

`test-routes.js` builds a minimally-compliant card of every type on every route
straight from `Prompts.CC_FIELD_SPECS` and asserts nothing flags. It is the guard
against the failure that made v13.98 necessary: a per-card floor and a set of
per-field ranges that quietly disagreed with each other.

`test-checks.js` is the regression fixture. The BAD array is slide 1.1 of the
v13.97.1 Sports Nutrition pack, verbatim; it must keep flagging, and the compliant
rewrite beside it must keep passing.

To measure a real pack, load a saved manifest and call the exported functions:

    const G = load('mod_contentcreator/generator');
    G.fieldIssues(section.cards, 'workplace').forEach(i => console.log(i));
