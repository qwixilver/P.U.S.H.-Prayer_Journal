Some notes on what I want to do:

### UI updates

1. Update the first run system to mask various areas of the interface to make it more clear how to follow the instructions on the slide
1. Add icons/screenshots/short video to the slides for even more clarity on how to use the app

### Feature updates

1. I want the security view to be enhanced. I want to be able to select which individual components of prayers can/should be shown when on the security view. Each event should also be able to be locked out in the security view as needed.

1. I want to make it possible to encrypt either the entire database, or just a single entry. This should also apply to the JSON backup output - single encrypted entries should still honor a JSON structure, but the content of those entries should be encrypted individually. if users choose to encrypt the whole file, then the JSON data will be the result of decrypting the file.

1. I want to expand the existing backup system with a way to backup to my favorite cloud services (google, onedrive, icloud, dropbox) automatically (on a schedule) and with a single tap. This is a privacy first system, but it's always good to be able to make backups! This of course would be optional, and there should be a warining that submitting backups to external services will be governed by their privacy policies (we might be able to use the existing tutorial modal for this?). This could also provide a simple way for users to have access to their data across devices if we have an oauth system that allows users to restore existing backups from their favorite cloud system too.

1. Answered status prayer requests should be grouped outside of the requested status prayers. There should be a toggle switch at the top right of the 'daily' tab that allows users to switch between requested and answered prayers. Answered prayers should never show in the 'single' view list. 
### Bugs
