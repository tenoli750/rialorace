# Release checklist

Use this before publishing a Rialo Race build.

## Pre-release

- Run `npm install` after dependency changes.
- Start the Vite dev server and verify the main race view loads.
- Check racer selection, replay behavior, and mobile layout.
- Confirm `vercel.json` still points to the intended frontend entry.

## Browser pass

- Test a fresh page load.
- Test replaying a race without refreshing the page.
- Check that visual assets and UI text fit on narrow screens.

## Notes

Document any gameplay rule changes in `README.md` so the deployed build and
repository description stay aligned.
