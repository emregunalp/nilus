#!/usr/bin/perl
# Cache version: perl _dev/bump.pl N   (then run _dev/build.ps1)
# Browsers keep scripts and styles for a while without asking the server again. Every local stylesheet and script
# address therefore carries ?v=N — in _dev/site.html and in every import between the scripts — and N goes up with
# each release, so a visitor never runs a new file next to an old one it still had (2026-10-16: an old choreo.js kept
# the Nakliye crates open after the fix was live). All files share one N, so a module is always the same address.
use strict;
use warnings;
use File::Find;

my $v = shift @ARGV;
die "usage: perl _dev/bump.pl N\n" unless defined $v && $v =~ /^\d+$/;

sub rewrite {
  my ($file, $code) = @_;
  local $/;
  open my $in, '<', $file or die "$file: $!";
  binmode $in;
  my $text = <$in>;
  close $in;
  my $was = $text;
  $code->() for $text;
  return 0 if $text eq $was;
  open my $out, '>', $file or die "$file: $!";
  binmode $out;
  print $out $text;
  close $out;
  return 1;
}

my $n = 0;
$n += rewrite('_dev/site.html', sub { s{((?:href|src)="(?:css|js)/[^"?]+\.(?:css|js))(?:\?v=\d+)?"}{$1?v=$v"}g });
find({ no_chdir => 1, wanted => sub {
  return unless /\.js$/ && !m{/scene-a/};
  $n += rewrite($_, sub { s{'(\.{1,2}/[^'?]+\.js)(?:\?v=\d+)?'}{'$1?v=$v'}g });
} }, 'js');
print "version $v: $n files changed\n";
