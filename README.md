# Mr. Nom Servers

Source code for the Mr. Nom server, a single server shared by:

- The original Android application  
  The Mr. Nom Android application can be downloaded from here: [https://mrnom.hetorus.nl](https://mrnom.hetorus.nl)
- The Python version of Mr. Nom, running on PC or in the browser  
  The python variant of Mr. Nom can be found here: [https://github.com/HetorusNL/mr_nom_python](https://github.com/HetorusNL/mr_nom_python)

Every highscore has a `source` field: `app` for highscores posted from the Android application, `web` for highscores from the Python version.

## Usage

Run the provided `docker-compose.yml` file while providing your (Firebase Cloud Messaging) FCM Token in the `FCM_TOKEN` environment variable.

## License

MIT License, Copyright (c) 2023 Tim Klein Nijenhuis <tim@hetorus.nl>
