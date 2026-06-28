IHateMoney is a lightweight web application to ease shared budget management
within a group — roommates, friends, family or a trip. It keeps track of who
paid what, for whom, and helps settle the bills with a minimal, no-nonsense
interface. Invited members don't need an account.

This is a self-maintained Cloudron package wrapping the official upstream
release. The database runs on Cloudron's managed MySQL addon and outbound
invitation/reminder mail goes through Cloudron's mail relay. Schema migrations
are applied automatically on every start, so updating is just a rebuild +
`cloudron update`.

Upstream project: https://ihatemoney.org
