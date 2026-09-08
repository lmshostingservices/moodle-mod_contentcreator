# Standing up Moodle 4.5 and 5.2 from scratch, to run tests/moodle/e2e-real-moodle.js

This is what was used to verify v15.4.25 on real Moodles (Ubuntu, PHP 8.3, MariaDB 10.11).
It needs ~1 GB of disk and about 15 minutes. No Docker.

    apt-get install -y mariadb-server php8.3-cli php8.3-mysql php8.3-xml php8.3-mbstring \
        php8.3-curl php8.3-zip php8.3-gd php8.3-intl php8.3-soap php8.3-opcache
    printf "max_input_vars = 5000\nmemory_limit = 512M\n" > /etc/php/8.3/cli/conf.d/99-moodle.ini
    mariadbd --user=root --datadir=/var/lib/mysql --socket=/run/mysqld/mysqld.sock &

    # Moodle 5.0+ moved the document root to public/ - note the -t below.
    tar xzf moodle-latest-405.tgz && mv moodle m45
    tar xzf moodle-latest-502.tgz && mv moodle m52

    cd m45 && php8.3 admin/cli/install.php --non-interactive --agree-license --lang=en \
        --wwwroot=http://127.0.0.1:8045 --dataroot=/var/moodledata45 --dbtype=mariadb \
        --dbhost=127.0.0.1 --dbname=m45 --dbuser=moodle --dbpass='...' \
        --fullname="CC Test 4.5" --shortname=cc45 --adminuser=admin --adminpass='Admin#12345' \
        --adminemail=admin@example.com
    # 5.2 is the same command; its CLI is still at admin/cli/install.php, but serve public/.

    # The plugin goes to mod/ on 4.5 and public/mod/ on 5.2.
    cp -r contentcreator m45/mod/ ; cp -r contentcreator m52/public/mod/
    (cd m45 && php8.3 admin/cli/upgrade.php --non-interactive)
    (cd m52 && php8.3 admin/cli/upgrade.php --non-interactive)

    PHP_CLI_SERVER_WORKERS=10 php8.3 -S 127.0.0.1:8045 -t m45 &
    PHP_CLI_SERVER_WORKERS=10 php8.3 -S 127.0.0.1:8052 -t m52/public &

Then seed a pack shaped like a saved schema-v2 manifest (`seed.php` in this folder) and run:

    node tests/moodle/e2e-real-moodle.js

**Upgrade path, not clean install.** Install the PREVIOUS release first, run the upgrade,
then copy this one over and upgrade again. A clean install hides upgrade-step faults.

**The manifest must carry `locked: true`** (or a section with `generated: true`), or
view.php shows the builder to a teacher and the player never renders - that is the plugin
working correctly, and it will look like a broken test.

**The first-run tutorial overlay intercepts clicks.** Dismiss `.cc5-tutorial-btn` first.
