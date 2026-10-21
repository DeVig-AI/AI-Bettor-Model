"""A search round posts its progress to /lab only once it has run a while (search.Progress): short back-to-back
rounds must not push a start note to main each time."""
import unittest
from unittest import mock

from research.lab import search


class ProgressPosts(unittest.TestCase):
    def test_short_rounds_post_nothing_long_ones_do(self):
        clock = [1000.0]
        with mock.patch("time.time", lambda: clock[0]), \
                mock.patch("research.lab.report.write_all") as write, mock.patch("subprocess.run") as run:
            p = search.Progress(every=600)
            p(1, 0, 300)                       # the round starts
            clock[0] += 90
            p(1, 299, 300)                     # a minute and a half later it is nearly done
            self.assertEqual((write.call_count, run.call_count), (0, 0))
            clock[0] += 600                    # a long round: one post after 10 minutes...
            p(1, 3000, 6000)
            p(1, 3001, 6000)                   # ...and not again right away
            self.assertEqual((write.call_count, run.call_count), (1, 1))
            self.assertIn("3,000 of 6,000 scored", run.call_args[0][0][1])


if __name__ == "__main__":
    unittest.main()
