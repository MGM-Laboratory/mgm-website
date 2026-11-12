# Privacy

This page describes, from the code, which personal data the site collects, why, where it is stored, who can read it and how long it stays. It is a technical description for the people who run the site. The privacy policy page of the site is a placeholder at the time of writing, so this page is the only description of the data in this repository.

## What is collected

| Source             | Data                                                                                                                                                                                                                                                                                                    | Why                                                   | Stored in                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Contact form       | Name, email address, company (optional), message and up to 5 attachments                                                                                                                                                                                                                                | To answer the person                                  | Table `CmsContactInquiry`, and the attachments in object storage                                         |
| Job application    | Applicant type, full name, email address, phone country code and number, student number and faculty (for applicants from Universitas Brawijaya), motivation text, the CV file, and the agreement to the terms                                                                                           | To review the application                             | Table `CmsJobApplication`, and the CV in object storage                                                  |
| Event registration | Full name, email address, phone number and the agreement to the terms                                                                                                                                                                                                                                   | To register the person for the event                  | Table `CmsEventRegistration`                                                                             |
| Form response      | The answers, an optional score, a session id, a device id, the user agent, the referrer, the language, the time zone, the screen size, the UTM parameters, the start time and the time spent. Also the IP address and the place (country, region, city and coordinates) when the form collects location | To give the editor the responses and their statistics | Tables `FormResponse` and `FormEvent`, and respondent files in object storage with a row in `FormUpload` |
| Short link visit   | IP address, user agent, referrer, country, region, city, coordinates, time zone, device, browser and operating system, and whether it was a view, a click or a failed passphrase                                                                                                                        | To show the editor how a link is used                 | Table `ShortLinkVisit`                                                                                   |
| Admin account      | The name, a hash of the passphrase, the permissions, the expiry and the time of the last login                                                                                                                                                                                                          | To let an editor sign in                              | Table `CmsAdmin`                                                                                         |
| Published profiles | Names, photos and profile texts of members, publication authors and project contributors, as an editor enters them                                                                                                                                                                                      | To show them on the public pages                      | The CMS tables and object storage                                                                        |

The person who fills a form chooses what to send. The contact form and the application form take only the fields in the table.

The device id of a form is a random value that the browser stores. The API keeps it with a response so that it can enforce the rule of one response for each device. A form can switch off the collection of the IP address and the place with the setting `collectLocation`. The default is on.

## The visit log

- A form stores the visit events `view`, `start`, `progress` and `submit` for each session. A session id is random and lives in the session storage of the tab.
- The API stores the user agent of a form visit and the browser, system and device type that it reads from the user agent.
- A short link visit always stores the IP address. The web app passes the address of the visitor to the API. The API reads the forwarded address, the header `cf-connecting-ip` or `x-forwarded-for`, and the address of the connection, in that order.
- A form visit stores the IP address only when `collectLocation` is on.
- The editor reads a short link visit log in the admin workspace, as totals, a 14 day series and the 50 most recent visits.

## What leaves the site

| Where                                                    | What                                                          | When                                                                                                                                                                                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ipwho.is`                                               | The IP address of a visitor                                   | After a short link visit, and after a form visit that stored an IP address. The API runs this lookup in the background. `SHORTLINKS_GEOLOCATE=false` turns it off. The API keeps the answers in memory by address, up to 5000 addresses |
| The mail provider (Resend, an SMTP server or Amazon SES) | The recipient address and the mail text                       | For every mail the site sends. The admin settings choose the provider                                                                                                                                                                   |
| The object storage service (an S3 compatible bucket)     | Uploaded files                                                | For every upload                                                                                                                                                                                                                        |
| YouTube                                                  | The visitor browser requests a thumbnail                      | When a form places a YouTube video. The player loads from the `youtube-nocookie` domain only after a click                                                                                                                              |
| Vimeo                                                    | The player, with do not track                                 | When a form places a Vimeo video, after a click                                                                                                                                                                                         |
| `fonts.googleapis.com` and `fonts.gstatic.com`           | The request of the browser for the fonts                      | When a visitor opens a short link gate page, an expired link page or a not found link page. These pages load fonts from Google                                                                                                          |
| The host of a linked form image or video                 | The request of the browser for the file                       | When an editor links a form image or video by URL (the kinds `image`, `video`, `youtube` and `vimeo` take a URL), the browser of the visitor loads it from that host                                                                    |
| The directions link on the contact page                  | Nothing, until the visitor follows the link to a maps service | When the visitor clicks the link                                                                                                                                                                                                        |

The mails that the site sends are the following.

- A notification of a contact message to the addresses in the contact settings. It holds the name, the email address, the company, the message and 7 day links to the attachments.
- A confirmation to the person who sent a contact message, a job application or an event registration.
- A notification of a form response to the addresses that the form lists, and a receipt to the respondent when the form turns receipts on. The notification holds the answers.

The code of the web app has no advertising and no analytics script. The main site serves its fonts itself through `next/font`. The short link pages load fonts from Google, as the table says.

## Cookies and browser storage

| Name                                           | Kind            | Holds                                                                                                 | Lifetime                                      |
| ---------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `mgm_admin_session`                            | Cookie          | The signed admin session                                                                              | 12 hours                                      |
| `mgm_form_<slug>`                              | Cookie          | The unlock token of a form with a passphrase                                                          | 12 hours                                      |
| `theme`                                        | Local storage   | The theme that the visitor chose                                                                      | Until the visitor clears it                   |
| `mgm-contact-form-draft`                       | Local storage   | The name, email address, company and message that the visitor typed. The code removes it after a send | Until the visitor sends the form or clears it |
| `mgm-form-draft:<slug>`                        | Local storage   | The answers of a form, when the form turns autosave on                                                | The code ignores a draft after 30 days        |
| `mgm-form-device`                              | Local storage   | A random device id                                                                                    | Until the visitor clears it                   |
| `mgm-form-done:<slug>`                         | Local storage   | The time of a response                                                                                | Until the visitor clears it                   |
| `mgm-form-session:<slug>`                      | Session storage | A random session id                                                                                   | Until the tab closes                          |
| `mgm:lab-notes`, `member-directory:return-url` | Session storage | Notes that were shown and the page to return to                                                       | Until the tab closes                          |
| `mgm-forms-view`                               | Local storage   | The editor choice of a grid or a list for the forms list                                              | Until the editor clears it                    |
| `mgm.forms.table.<formId>`                     | Local storage   | The editor table settings of the responses of a form                                                  | Until the editor clears it                    |
| `mgm.forms.pipeline.<formId>`                  | Local storage   | The editor data cleaning steps for the responses of a form                                            | Until the editor clears it                    |
| `mgm-forms-my-templates`                       | Local storage   | The form templates that an editor saved                                                               | Until the editor clears it                    |
| `mgm.links.lastDomainId`                       | Local storage   | The id of the short link domain that an editor used last                                              | Until the editor clears it                    |
| A key of the process magnets                   | Local storage   | The arrangement of the magnets that the visitor moved                                                 | Until the visitor clears it                   |

## Who can read it

- The superadmin can read everything in the admin workspace.
- A delegated editor reads a kind of data only with the permission for its page. The contact inbox needs `contact-inquiries` read. Applications need `careers`. Registrations need `events`. Form responses and form visits need `forms`. Short link visits need `links`.
- The person who runs the site can read the database, the object storage and the API logs. The API request log holds the method, the path, the status, the timing and the request headers.
- The mail providers and the recipients of the notification mails see the mail text.
- A signed download link opens a stored file for anyone who holds the link until it expires. The lifetime is 15 minutes for most files, and 7 days in the contact notification mail. These lifetimes hold when `REDIS_URL` is not set, because the cache of signed URLs is keyed by the object key alone.

## How long it stays

The code has no retention period for personal data. Records stay until an editor deletes them. The exceptions are in the table.

| Data                                        | Rule in the code                                                                                                                                                     |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Form uploads that no response claims        | The API deletes them after one day, when a later upload to the same form runs the cleanup                                                                            |
| A form response                             | Stays until an editor deletes it, or deletes the form. Deleting a response also deletes its files                                                                    |
| A form                                      | Deleting a form deletes its responses, events and uploads, with the stored files                                                                                     |
| A job application                           | Stays until an editor deletes it. The delete also removes the CV from storage                                                                                        |
| A contact message                           | Stays until an editor deletes it. The delete removes the record and leaves the attachment files in storage                                                           |
| A contact attachment that no message claims | The browser uploads an attachment before it sends the message. The code has no cleanup for contact attachments, so an upload that no message claims stays in storage |
| An event registration                       | Stays until an editor deletes it                                                                                                                                     |
| A short link visit                          | Stays until an editor deletes the link, and the delete removes its visits                                                                                            |
| The geolocation cache                       | Lives in the memory of the API process and goes with a restart                                                                                                       |

## Requests from a person

The code has no route for a person to see or delete their own data. A person can write to **hi@labmgm.org**. An editor can delete a form response, an application, a registration or a contact message in the admin workspace. The attachment of a contact message needs a deletion in the object storage as well.
